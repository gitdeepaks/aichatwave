import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { getJson } from "serpapi";
import { env } from "@/lib/env";
import {
  displayNewsResultSchema,
  displayProductsResultSchema,
  displayWeatherResultSchema,
  type DisplayNewsResult,
  type DisplayProductsResult,
  type DisplayWeatherResult,
  type NewsItem,
  type Product,
} from "@/lib/ai/tool-contracts";
import { logger } from "@/server/lib/logger";

/**
 * Every tool here returns a value parsed through its contract in
 * `lib/ai/tool-contracts.ts`, so the renderer and the tool cannot disagree
 * about a field. Provider responses are parsed on arrival too: SerpAPI types
 * its payload as `Record<string, any>` and the weather and news endpoints are
 * untyped JSON, so each is narrowed at the edge rather than trusted.
 */

const serpShoppingResponseSchema = z.object({
  shopping_results: z
    .array(
      z.object({
        product_id: z.union([z.string(), z.number()]).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        extracted_price: z.union([z.string(), z.number()]).optional(),
        price: z.union([z.string(), z.number()]).optional(),
        rating: z.union([z.string(), z.number()]).optional(),
        thumbnail: z.string().optional(),
        /** SerpAPI's own misspelling, still present in some responses. */
        thumnail: z.string().optional(),
        product_link: z.string().optional(),
      }),
    )
    .optional(),
});

/** Prices and ratings arrive as numbers, as `"$1,299.00"`, or not at all. */
function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const geocodingResultSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string().optional(),
        country: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      }),
    )
    .optional(),
});

const weatherResponseSchema = z.object({
  current: z
    .object({
      temperature_2m: z.number().optional(),
      relative_humidity_2m: z.number().optional(),
      apparent_temperature: z.number().optional(),
      is_day: z.number().optional(),
      weather_code: z.number().optional(),
      wind_speed_10m: z.number().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()).optional(),
      temperature_2m: z.array(z.number()).optional(),
      weather_code: z.array(z.number()).optional(),
    })
    .optional(),
  daily: z
    .object({
      time: z.array(z.string()).optional(),
      temperature_2m_max: z.array(z.number()).optional(),
      temperature_2m_min: z.array(z.number()).optional(),
      sunrise: z.array(z.string()).optional(),
      sunset: z.array(z.string()).optional(),
      weather_code: z.array(z.number()).optional(),
    })
    .optional(),
});

const yahooFinanceSearchResponseSchema = z.object({
  news: z
    .array(
      z.object({
        uuid: z.string().optional(),
        title: z.string().optional(),
        publisher: z.string().optional(),
        link: z.string().optional(),
        providerPublishTime: z.number().optional(),
        relatedTickers: z.array(z.string()).optional(),
        thumbnail: z
          .object({
            resolutions: z.array(z.object({ url: z.string().optional() })).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

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
  providerPublishTime: number | undefined;
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
  async ({
    query,
    location = "India",
  }: {
    query: string;
    location?: string;
  }): Promise<DisplayProductsResult> => {
    try {
      const resolved = serpShoppingLocation(location);
      if (env.SERP_API_KEY === undefined) {
        // Not reachable through `tools` below, which omits this tool entirely
        // when the key is absent. Kept so a direct caller degrades to an empty
        // result rather than sending SerpAPI an undefined key.
        logger.warn("tool.products_unconfigured", { tool: "display_products", query });
        return displayProductsResultSchema.parse({ query, products: [] });
      }
      const response = await getJson({
        engine: "google_shopping",
        q: query,
        api_key: env.SERP_API_KEY,
        ...(resolved ? { location: resolved } : {}),
      });

      const shoppingResults = serpShoppingResponseSchema.parse(response).shopping_results ?? [];

      // `id` and `title` fall back on any empty value, not just a missing one:
      // the contract requires both to be non-empty, and one blank field from
      // SerpAPI would otherwise cost the whole carousel.
      const products: Product[] = shoppingResults.slice(0, 6).map((product, index) => ({
        id: String(product.product_id ?? "").trim() || String(index),
        title: product.title?.trim() || `Product ${index + 1}`,
        description: product.description ?? "",
        price: toNumber(product.extracted_price ?? product.price),
        rating: toNumber(product.rating),
        thumbnail: product.thumbnail ?? product.thumnail ?? "",
        ...(product.product_link === undefined
          ? {}
          : { productLink: `${product.product_link}&utm_source=aichatwave.in` }),
      }));

      const result: DisplayProductsResult = { query, products };
      return displayProductsResultSchema.parse(result);
    } catch (error) {
      logger.error("tool.products_fetch_failed", { tool: "display_products", query }, error);
      // Deliberately no `error`: an empty carousel reads as "nothing found",
      // which is what a user can act on, and the failure is in the log.
      return displayProductsResultSchema.parse({ query, products: [] });
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

/** The zeroed card the weather tool shows when it has nothing to report. */
function weatherError(location: string, error: string): DisplayWeatherResult {
  return displayWeatherResultSchema.parse({
    location,
    temperature: 0,
    feelsLike: 0,
    humidity: 0,
    windSpeed: 0,
    isDay: true,
    weatherCode: 0,
    error,
  });
}

export const weatherTool = tool(
  async ({ location }: { location: string }): Promise<DisplayWeatherResult> => {
    try {
      const queryLocation = location?.trim();
      if (!queryLocation) {
        return weatherError("", "Please provide a valid city or location.");
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

      const geocodeData = geocodingResultSchema.parse(await geocodeResponse.json());
      const resolvedLocation = geocodeData.results?.[0];

      if (
        !resolvedLocation ||
        typeof resolvedLocation.latitude !== "number" ||
        typeof resolvedLocation.longitude !== "number"
      ) {
        return weatherError(queryLocation, `Could not find weather data for "${queryLocation}".`);
      }

      const resolvedLocationLabel = `${resolvedLocation.name ?? queryLocation}, ${
        resolvedLocation.country ?? ""
      }`.replace(/,\s*$/, "");

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

      const weatherData = weatherResponseSchema.parse(await weatherResponse.json());
      const current = weatherData.current;

      if (!current) {
        return weatherError(
          resolvedLocationLabel,
          "Current weather is unavailable for this location.",
        );
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
          if (typeof max !== "number" || typeof min !== "number" || typeof code !== "number")
            continue;
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
          ? new Date(sunriseRaw).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })
          : "";
      const sunset =
        typeof sunsetRaw === "string"
          ? new Date(sunsetRaw).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })
          : "";

      const todayHigh =
        typeof weatherData.daily?.temperature_2m_max?.[0] === "number"
          ? Number(weatherData.daily?.temperature_2m_max?.[0])
          : null;
      const todayLow =
        typeof weatherData.daily?.temperature_2m_min?.[0] === "number"
          ? Number(weatherData.daily?.temperature_2m_min?.[0])
          : null;

      const result: DisplayWeatherResult = {
        location: resolvedLocationLabel,
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
      return displayWeatherResultSchema.parse(result);
    } catch (error) {
      logger.error("tool.weather_fetch_failed", { tool: "display_weather", location }, error);
      return weatherError(location, "Unable to fetch weather right now. Please try again.");
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
  async ({ query }: { query: string }): Promise<DisplayNewsResult> => {
    try {
      const trimmedQuery = query?.trim();
      if (!trimmedQuery) {
        return displayNewsResultSchema.parse({
          query: "",
          news: [],
          error: "Please provide a stock, crypto, or company name.",
        });
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

      const data = yahooFinanceSearchResponseSchema.parse(await response.json());
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
      const news: NewsItem[] = picked.map(({ providerPublishTime, score, ...item }) => item);

      const summary =
        news.length > 0
          ? `As of ${new Date().toLocaleDateString()}, "${trimmedQuery}" is in focus with ${
              news.length
            } latest headline${news.length > 1 ? "s" : ""}. Top coverage highlights: ${news
              .slice(0, 3)
              .map((item) => item.title)
              .join(" | ")}.`
          : `No recent headlines were found for "${trimmedQuery}".`;

      const result: DisplayNewsResult = { query: trimmedQuery, news, summary };
      return displayNewsResultSchema.parse(result);
    } catch (error) {
      logger.error("tool.news_fetch_failed", { tool: "display_news", query }, error);
      return displayNewsResultSchema.parse({
        query,
        news: [],
        summary: "",
        error: "Unable to fetch news right now. Please try again.",
      });
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
