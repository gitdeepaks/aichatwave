import {
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Message } from "@/components/ai-elements/message";
import { NewsCard, type NewsItem } from "@/components/gen-ui/news-card";
import { ProductCarousel, type Product as CarouselProduct } from "@/components/gen-ui/product-carousel";
import { WeatherCard, type WeatherCardProps } from "@/components/gen-ui/weather-card";
import type { UIMessage } from "ai";
import { CopyIcon, RefreshCcwIcon } from "lucide-react";
import { Fragment } from "react";

type DisplayProductsPayload = {
  query?: string;
  products?: unknown[];
  error?: string;
};

type DisplayWeatherPayload = {
  location?: string;
  temperature?: unknown;
  feelsLike?: unknown;
  humidity?: unknown;
  windSpeed?: unknown;
  isDay?: unknown;
  weatherCode?: unknown;
  error?: string;
};

type DisplayNewsPayload = {
  query?: string;
  news?: unknown[];
  summary?: string;
  error?: string;
};

type RawProduct = {
  id?: string | number;
  product_id?: string | number;
  title?: string;
  description?: string;
  price?: number | string;
  extracted_price?: number | string;
  rating?: number | string;
  thumbnail?: string;
  thumnail?: string;
  product_link?: string;
};

type RawNews = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  publishTime?: string;
  thumbnail?: string | null;
};

const parseJsonIfString = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseDisplayProductsPayload = (output: unknown): DisplayProductsPayload => {
  const resolvedOutput = parseJsonIfString(output) as Record<string, unknown> | undefined;
  const kwargs = parseJsonIfString(resolvedOutput?.kwargs) as Record<string, unknown> | undefined;
  const content = parseJsonIfString(kwargs?.content) as
    | Record<string, unknown>
    | DisplayProductsPayload
    | undefined;

  const payload = (content ?? {}) as DisplayProductsPayload;
  return {
    query: typeof payload.query === "string" ? payload.query : "",
    products: Array.isArray(payload.products) ? payload.products : [],
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
};

const parseDisplayWeatherPayload = (output: unknown): DisplayWeatherPayload => {
  const resolvedOutput = parseJsonIfString(output) as Record<string, unknown> | undefined;
  const kwargs = parseJsonIfString(resolvedOutput?.kwargs) as Record<string, unknown> | undefined;
  const content = parseJsonIfString(kwargs?.content) as
    | Record<string, unknown>
    | DisplayWeatherPayload
    | undefined;

  const payload = (content ?? {}) as DisplayWeatherPayload;
  return {
    location: typeof payload.location === "string" ? payload.location : "",
    temperature: payload.temperature,
    feelsLike: payload.feelsLike,
    humidity: payload.humidity,
    windSpeed: payload.windSpeed,
    isDay: payload.isDay,
    weatherCode: payload.weatherCode,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
};

const parseDisplayNewsPayload = (output: unknown): DisplayNewsPayload => {
  const resolvedOutput = parseJsonIfString(output) as Record<string, unknown> | undefined;
  const kwargs = parseJsonIfString(resolvedOutput?.kwargs) as Record<string, unknown> | undefined;
  const content = parseJsonIfString(kwargs?.content) as
    | Record<string, unknown>
    | DisplayNewsPayload
    | undefined;

  const payload = (content ?? {}) as DisplayNewsPayload;
  return {
    query: typeof payload.query === "string" ? payload.query : "",
    news: Array.isArray(payload.news) ? payload.news : [],
    summary: typeof payload.summary === "string" ? payload.summary : "",
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeProducts = (products: unknown[]): CarouselProduct[] => {
  return products
    .map((raw, index) => {
      const p = (raw ?? {}) as RawProduct;
      const title = typeof p.title === "string" ? p.title : `Product ${index + 1}`;
      const description = typeof p.description === "string" ? p.description : "";
      const thumbnail =
        typeof p.thumbnail === "string"
          ? p.thumbnail
          : typeof p.thumnail === "string"
            ? p.thumnail
            : "";

      return {
        id:
          typeof p.id === "string" || typeof p.id === "number"
            ? p.id
            : typeof p.product_id === "string" || typeof p.product_id === "number"
              ? p.product_id
              : String(index),
        title,
        description,
        price: toNumber(p.price ?? p.extracted_price),
        rating: toNumber(p.rating),
        thumbnail,
        product_link: typeof p.product_link === "string" ? p.product_link : undefined,
      } satisfies CarouselProduct;
    })
    .filter((p) => p.title.length > 0);
};

const normalizeWeather = (payload: DisplayWeatherPayload): WeatherCardProps => {
  return {
    location: payload.location ?? "",
    temperature: toNumber(payload.temperature),
    feelsLike: toNumber(payload.feelsLike),
    humidity: toNumber(payload.humidity),
    windSpeed: toNumber(payload.windSpeed),
    isDay: typeof payload.isDay === "boolean" ? payload.isDay : Number(payload.isDay) === 1,
    weatherCode: toNumber(payload.weatherCode),
    error: payload.error,
  };
};

const normalizeNews = (news: unknown[]): NewsItem[] => {
  return news
    .map((raw, index) => {
      const item = (raw ?? {}) as RawNews;
      if (typeof item.link !== "string" || item.link.length === 0) return null;

      return {
        uuid: typeof item.uuid === "string" ? item.uuid : `news-${index}`,
        title: typeof item.title === "string" && item.title.length > 0 ? item.title : "Untitled headline",
        publisher:
          typeof item.publisher === "string" && item.publisher.length > 0
            ? item.publisher
            : "Unknown source",
        link: item.link,
        publishTime: typeof item.publishTime === "string" ? item.publishTime : "",
        thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : null,
      } satisfies NewsItem;
    })
    .filter((item): item is NewsItem => item !== null);
};

export const MessageRenderer = ({ messages }: { messages: UIMessage[] }) => {
  return (
    <div className="flex flex-col">
      {messages.map((message: UIMessage, messageIndex: number) => (
        <Fragment key={message.id}>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case "text":
                const isLastMessage = messageIndex === messages.length - 1;
                return (
                  <Fragment key={`${message.id}-${i}`}>
                    <Message from={message.role}>
                      <MessageContent>
                        <MessageResponse>{part.text}</MessageResponse>
                      </MessageContent>
                    </Message>
                    {message.role === "assistant" && isLastMessage && (
                      <MessageActions>
                        <MessageAction onClick={() => {}} label="Retry">
                          <RefreshCcwIcon className="size-3" />
                        </MessageAction>
                        <MessageAction
                          onClick={() => navigator.clipboard.writeText(part.text)}
                          label="Copy"
                        >
                          <CopyIcon className="size-3" />
                        </MessageAction>
                      </MessageActions>
                    )}
                  </Fragment>
                );
              case "dynamic-tool":
                switch (part.toolName) {
                  case "display_products":
                  case "display-products":
                    if (part.state === "output-available") {
                      const toolContent = parseDisplayProductsPayload(part.output);
                      const normalizedProducts = normalizeProducts(toolContent.products ?? []);
                      return (
                        <Message from={message.role} key={`${part.toolCallId}-${i}`}>
                          <MessageContent>
                            <ProductCarousel
                              query={toolContent.query ?? ""}
                              products={normalizedProducts}
                              error={toolContent.error}
                            />
                          </MessageContent>
                        </Message>
                      );
                    }
                    return null;
                  case "display_weather":
                  case "display-weather":
                    if (part.state === "output-available") {
                      const toolContent = parseDisplayWeatherPayload(part.output);
                      const normalizedWeather = normalizeWeather(toolContent);
                      return (
                        <Message from={message.role} key={`${part.toolCallId}-${i}`}>
                          <MessageContent>
                            <WeatherCard {...normalizedWeather} />
                          </MessageContent>
                        </Message>
                      );
                    }
                    return null;
                  case "display_news":
                  case "display-news":
                    if (part.state === "output-available") {
                      const toolContent = parseDisplayNewsPayload(part.output);
                      const normalizedNews = normalizeNews(toolContent.news ?? []);
                      return (
                        <Message from={message.role} key={`${part.toolCallId}-${i}`}>
                          <MessageContent>
                            <NewsCard
                              query={toolContent.query ?? ""}
                              news={normalizedNews}
                              error={toolContent.error}
                            />
                          </MessageContent>
                        </Message>
                      );
                    }
                    return null;
                }

              default:
                return null;
            }
          })}
        </Fragment>
      ))}
    </div>
  );
};
