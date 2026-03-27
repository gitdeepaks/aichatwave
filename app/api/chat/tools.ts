import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { getJson } from "serpapi";

type ProductFromAPI = {
  product_id: string;
  title: string;
  extracted_price: string;
  description: string;
  rating: number;
  thumbnail?: string;
  thumnail?: string;
  product_link: string;
};

type Product = {
  id: string;
  title: string;
  description: string;
  price: string;
  rating: number;
  thumbnail: string;
  product_link: string;
};

type GeocodingResult = {
  results?: Array<{
    name?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }>;
};

type WeatherResponse = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    sunrise?: string[];
    sunset?: string[];
    weather_code?: number[];
  };
};

type YahooFinanceSearchResponse = {
  news?: Array<{
    uuid?: string;
    title?: string;
    publisher?: string;
    link?: string;
    providerPublishTime?: number;
    relatedTickers?: string[];
    thumbnail?: {
      resolutions?: Array<{
        url?: string;
      }>;
    };
  }>;
};

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 1);
}

function scoreNewsItem(params: {
  query: string;
  title: string;
  publisher: string;
  relatedTickers: string[];
  providerPublishTime?: number;
}): number {
  const { query, title, publisher, relatedTickers, providerPublishTime } = params;
  const q = query.toLowerCase();
  const titleLower = title.toLowerCase();
  const publisherLower = publisher.toLowerCase();
  const tokens = tokenizeQuery(query);

  let score = 0;

  if (titleLower.includes(q)) score += 16;
  if (publisherLower.includes(q)) score += 4;

  for (const token of tokens) {
    if (titleLower.includes(token)) score += 5;
    if (publisherLower.includes(token)) score += 2;
  }

  const tickerMatch = relatedTickers.some((ticker) => ticker.toLowerCase() === q);
  const partialTickerMatch = relatedTickers.some((ticker) => ticker.toLowerCase().includes(q));
  if (tickerMatch) score += 22;
  else if (partialTickerMatch) score += 8;

  if (typeof providerPublishTime === "number" && Number.isFinite(providerPublishTime)) {
    const ageHours = (Date.now() - providerPublishTime * 1000) / (1000 * 60 * 60);
    if (ageHours <= 6) score += 8;
    else if (ageHours <= 24) score += 6;
    else if (ageHours <= 72) score += 3;
  }

  return score;
}

/** SerpAPI rejects bare ISO codes (e.g. `US`); use canonical names from https://serpapi.com/locations-api */
const LOCALE_ALIASES: Record<string, string> = {
  us: "Austin,Texas,United States",
  usa: "Austin,Texas,United States",
  in: "Mumbai,Maharashtra,India",
  india: "Mumbai,Maharashtra,India",
  gb: "London,England,United Kingdom",
  uk: "London,England,United Kingdom",
  uae: "Dubai,Dubai,United Arab Emirates",
  ae: "Dubai,Dubai,United Arab Emirates",
};

function serpShoppingLocation(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const alias = LOCALE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  if (/^[a-z]{2}$/i.test(trimmed)) return undefined;
  return trimmed;
}

export const productTool = tool(
  async ({ query, location = "India" }: { query: string; location?: string }) => {
    try {
      console.log("query", query);
      console.log("location", location);

      const resolved = serpShoppingLocation(location);
      const result = await getJson({
        engine: "google_shopping",
        q: query,
        api_key: process.env.SERP_API_KEY,
        ...(resolved ? { location: resolved } : {}),
      });

      if (!result.shopping_results?.length) {
        return {
          query,
          products: [],
        };
      }

      const products = result.shopping_results
        .slice(0, 6)
        .map((product: ProductFromAPI, index: number): Product => {
          return {
            id: product.product_id || String(index),
            title: product.title,
            description: product.description,
            price: product.extracted_price,
            rating: product.rating,
            thumbnail: product.thumbnail || product.thumnail || "",
            product_link: product.product_link + "&utm_source=aichatwave.in ",
          };
        });

      return {
        query,
        products,
      };
    } catch (error) {
      console.error("Error fetching the shopping products", error);
      return {
        query,
        products: [],
      };
    }
  },
  {
    name: "display_products",
    description:
      "Search for real eCommerce products with prices and display them in a carousel in details, Always call this tool when user searces for any product",
    schema: z.object({
      query: z.string().describe("The product to search for e.g. 'iphone 17 pro max'"),
      location: z
        .string()
        .optional()
        .describe(
          "User's place for local results; only if they asked explicitly. Use a city or country name (e.g. 'Mumbai, India'), not ISO codes like 'US'.",
        ),
    }),
  },
);

export const weatherTool = tool(
  async ({ location }: { location: string }) => {
    try {
      const queryLocation = location?.trim();
      if (!queryLocation) {
        return {
          location: "",
          temperature: 0,
          feelsLike: 0,
          humidity: 0,
          windSpeed: 0,
          isDay: true,
          weatherCode: 0,
          error: "Please provide a valid city or location.",
        };
      }

      const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geocodeUrl.searchParams.set("name", queryLocation);
      geocodeUrl.searchParams.set("count", "1");
      geocodeUrl.searchParams.set("language", "en");
      geocodeUrl.searchParams.set("format", "json");

      const geocodeResponse = await fetch(geocodeUrl.toString());
      if (!geocodeResponse.ok) {
        throw new Error(`Geocoding failed with status ${geocodeResponse.status}`);
      }

      const geocodeData = (await geocodeResponse.json()) as GeocodingResult;
      const resolvedLocation = geocodeData.results?.[0];

      if (
        !resolvedLocation ||
        typeof resolvedLocation.latitude !== "number" ||
        typeof resolvedLocation.longitude !== "number"
      ) {
        return {
          location: queryLocation,
          temperature: 0,
          feelsLike: 0,
          humidity: 0,
          windSpeed: 0,
          isDay: true,
          weatherCode: 0,
          error: `Could not find weather data for "${queryLocation}".`,
        };
      }

      const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
      weatherUrl.searchParams.set("latitude", String(resolvedLocation.latitude));
      weatherUrl.searchParams.set("longitude", String(resolvedLocation.longitude));
      weatherUrl.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
      );
      weatherUrl.searchParams.set("hourly", "temperature_2m,weather_code");
      weatherUrl.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code",
      );
      weatherUrl.searchParams.set("wind_speed_unit", "mph");
      weatherUrl.searchParams.set("timezone", "auto");

      const weatherResponse = await fetch(weatherUrl.toString());
      if (!weatherResponse.ok) {
        throw new Error(`Weather fetch failed with status ${weatherResponse.status}`);
      }

      const weatherData = (await weatherResponse.json()) as WeatherResponse;
      const current = weatherData.current;

      if (!current) {
        return {
          location:
            `${resolvedLocation.name ?? queryLocation}, ${resolvedLocation.country ?? ""}`.replace(
              /,\s*$/,
              "",
            ),
          temperature: 0,
          feelsLike: 0,
          humidity: 0,
          windSpeed: 0,
          isDay: true,
          weatherCode: 0,
          error: "Current weather is unavailable for this location.",
        };
      }

      const hourly = (() => {
        const times = weatherData.hourly?.time ?? [];
        const temps = weatherData.hourly?.temperature_2m ?? [];
        const codes = weatherData.hourly?.weather_code ?? [];
        const out: Array<{ time: string; temperature: number; weatherCode: number }> = [];

        const nowTs = Date.now();
        for (let i = 0; i < times.length; i++) {
          const t = times[i];
          const temp = temps[i];
          const code = codes[i];
          if (typeof t !== "string") continue;
          const ts = new Date(t).getTime();
          if (!Number.isFinite(ts) || ts < nowTs) continue;
          if (typeof temp !== "number" || typeof code !== "number") continue;
          out.push({
            time: new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
            temperature: temp,
            weatherCode: code,
          });
          if (out.length >= 8) break;
        }
        return out;
      })();

      const daily = (() => {
        const days = weatherData.daily?.time ?? [];
        const maxs = weatherData.daily?.temperature_2m_max ?? [];
        const mins = weatherData.daily?.temperature_2m_min ?? [];
        const codes = weatherData.daily?.weather_code ?? [];
        const out: Array<{ day: string; min: number; max: number; weatherCode: number }> = [];

        for (let i = 0; i < days.length && i < 7; i++) {
          const d = days[i];
          const max = maxs[i];
          const min = mins[i];
          const code = codes[i];
          if (typeof d !== "string") continue;
          if (typeof max !== "number" || typeof min !== "number" || typeof code !== "number") continue;
          out.push({
            day: new Date(d).toLocaleDateString(undefined, { weekday: "short" }),
            min,
            max,
            weatherCode: code,
          });
        }
        return out;
      })();

      const sunriseRaw = weatherData.daily?.sunrise?.[0];
      const sunsetRaw = weatherData.daily?.sunset?.[0];
      const sunrise =
        typeof sunriseRaw === "string"
          ? new Date(sunriseRaw).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
          : "";
      const sunset =
        typeof sunsetRaw === "string"
          ? new Date(sunsetRaw).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
          : "";

      const todayHigh =
        typeof weatherData.daily?.temperature_2m_max?.[0] === "number"
          ? Number(weatherData.daily?.temperature_2m_max?.[0])
          : null;
      const todayLow =
        typeof weatherData.daily?.temperature_2m_min?.[0] === "number"
          ? Number(weatherData.daily?.temperature_2m_min?.[0])
          : null;

      return {
        location:
          `${resolvedLocation.name ?? queryLocation}, ${resolvedLocation.country ?? ""}`.replace(
            /,\s*$/,
            "",
          ),
        temperature: Number(current.temperature_2m ?? 0),
        feelsLike: Number(current.apparent_temperature ?? 0),
        humidity: Number(current.relative_humidity_2m ?? 0),
        windSpeed: Number(current.wind_speed_10m ?? 0),
        isDay: Number(current.is_day ?? 1) === 1,
        weatherCode: Number(current.weather_code ?? 0),
        ...(todayHigh === null ? {} : { todayHigh }),
        ...(todayLow === null ? {} : { todayLow }),
        ...(sunrise ? { sunrise } : {}),
        ...(sunset ? { sunset } : {}),
        ...(hourly.length ? { hourly } : {}),
        ...(daily.length ? { daily } : {}),
      };
    } catch (error) {
      console.error("Error fetching weather", error);
      return {
        location,
        temperature: 0,
        feelsLike: 0,
        humidity: 0,
        windSpeed: 0,
        isDay: true,
        weatherCode: 0,
        error: "Unable to fetch weather right now. Please try again.",
      };
    }
  },
  {
    name: "display_weather",
    description:
      "Get current weather for a city/location and display it in a weather card with temperature, conditions, humidity, and wind.",
    schema: z.object({
      location: z.string().describe('City or location name like "New York", "London", or "Tokyo"'),
    }),
  },
);

export const newsTool = tool(
  async ({ query }: { query: string }) => {
    try {
      const trimmedQuery = query?.trim();
      if (!trimmedQuery) {
        return {
          query: "",
          news: [],
          error: "Please provide a stock, crypto, or company name.",
        };
      }

      const endpoint = new URL("https://query2.finance.yahoo.com/v1/finance/search");
      endpoint.searchParams.set("q", trimmedQuery);
      endpoint.searchParams.set("newsCount", "20");
      endpoint.searchParams.set("quotesCount", "0");
      endpoint.searchParams.set("listsCount", "0");
      endpoint.searchParams.set("enableFuzzyQuery", "false");
      endpoint.searchParams.set("enableEnhancedTrivialQuery", "true");

      const response = await fetch(endpoint.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance search failed with status ${response.status}`);
      }

      const data = (await response.json()) as YahooFinanceSearchResponse;
      const scoredNews = (data.news ?? [])
        .map((item, index) => {
          const title = item.title || "Untitled headline";
          const publisher = item.publisher || "Unknown source";
          const link = item.link || "";
          const relatedTickers = Array.isArray(item.relatedTickers) ? item.relatedTickers : [];
          const score = scoreNewsItem({
            query: trimmedQuery,
            title,
            publisher,
            relatedTickers,
            providerPublishTime: item.providerPublishTime,
          });

          return {
            uuid: item.uuid || `${trimmedQuery}-${index}`,
            title,
            publisher,
            link,
            publishTime: item.providerPublishTime
              ? new Date(item.providerPublishTime * 1000).toLocaleString()
              : "",
            thumbnail: item.thumbnail?.resolutions?.[0]?.url ?? null,
            providerPublishTime: item.providerPublishTime ?? 0,
            score,
          };
        })
        .filter((item) => item.link.length > 0);

      scoredNews.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.providerPublishTime ?? 0) - (a.providerPublishTime ?? 0);
      });

      const seen = new Set<string>();
      const deduped = scoredNews.filter((item) => {
        const key = `${item.title.toLowerCase().trim()}|${item.publisher.toLowerCase().trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const picked = (deduped.length > 0 ? deduped : scoredNews).slice(0, 5);
      const news = picked.map(({ providerPublishTime, score, ...item }) => item);

      const summary =
        news.length > 0
          ? `As of ${new Date().toLocaleDateString()}, "${trimmedQuery}" is in focus with ${
              news.length
            } latest headline${news.length > 1 ? "s" : ""}. Top coverage highlights: ${news
              .slice(0, 3)
              .map((item) => item.title)
              .join(" | ")}.`
          : `No recent headlines were found for "${trimmedQuery}".`;

      return {
        query: trimmedQuery,
        news,
        summary,
      };
    } catch (error) {
      console.error("Error fetching Yahoo Finance news", error);
      return {
        query,
        news: [],
        summary: "",
        error: "Unable to fetch news right now. Please try again.",
      };
    }
  },
  {
    name: "display_news",
    description:
      "Fetch the latest finance news headlines for a Geopolitical events, wars (if any),tensions between countries(if any),stock, cryptocurrency, or company and show them as clickable news cards.",
    schema: z.object({
      query: z.string().describe('Search term like "AAPL", "Bitcoin", or "Tesla"'),
    }),
  },
);

export const tools = [productTool, weatherTool, newsTool];
