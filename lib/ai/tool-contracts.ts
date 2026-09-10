/**
 * The contract between a tool and the component that renders its result.
 *
 * One Zod schema per tool, and the inferred type is what both sides speak:
 * `server/chat/tools.ts` returns the parsed value, and the gen-UI cards take
 * it as their props. A field added, renamed, or retyped here is a compile
 * error on the producer and on the renderer in the same run.
 *
 * Before this file the tool returned a loosely shaped object, the payload was
 * flattened to JSON on the way through LangChain, and the renderer rebuilt it
 * with two dozen `unknown` narrowings and hand-written `toNumber`/`isRecord`
 * helpers — which meant a renamed field failed silently at runtime, as a card
 * showing `0`, instead of loudly at compile time.
 *
 * Client-safe: pure schemas and types, no server imports.
 */

import { z } from "zod";
import { parseJsonText } from "@/lib/json";

/** Tool names as the model calls them, and the discriminant of `ToolResult`. */
export const TOOL_NAMES = ["display_products", "display_weather", "display_news"] as const;
export const toolNameSchema = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof toolNameSchema>;

export const productSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  price: z.number(),
  rating: z.number(),
  thumbnail: z.string(),
  productLink: z.string().optional(),
});
export type Product = z.infer<typeof productSchema>;

export const displayProductsResultSchema = z.object({
  query: z.string(),
  products: z.array(productSchema),
  error: z.string().optional(),
});
export type DisplayProductsResult = z.infer<typeof displayProductsResultSchema>;

export const hourlyForecastSchema = z.object({
  time: z.string(),
  temperature: z.number(),
  weatherCode: z.number(),
});
export type HourlyForecast = z.infer<typeof hourlyForecastSchema>;

export const dailyForecastSchema = z.object({
  day: z.string(),
  min: z.number(),
  max: z.number(),
  weatherCode: z.number(),
});
export type DailyForecast = z.infer<typeof dailyForecastSchema>;

export const displayWeatherResultSchema = z.object({
  location: z.string(),
  temperature: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  windSpeed: z.number(),
  isDay: z.boolean(),
  weatherCode: z.number(),
  todayHigh: z.number().optional(),
  todayLow: z.number().optional(),
  sunrise: z.string().optional(),
  sunset: z.string().optional(),
  hourly: z.array(hourlyForecastSchema).optional(),
  daily: z.array(dailyForecastSchema).optional(),
  error: z.string().optional(),
});
export type DisplayWeatherResult = z.infer<typeof displayWeatherResultSchema>;

export const newsItemSchema = z.object({
  uuid: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string(),
  link: z.string().min(1),
  publishTime: z.string(),
  thumbnail: z.string().nullable(),
});
export type NewsItem = z.infer<typeof newsItemSchema>;

export const displayNewsResultSchema = z.object({
  query: z.string(),
  news: z.array(newsItemSchema),
  summary: z.string().optional(),
  error: z.string().optional(),
});
export type DisplayNewsResult = z.infer<typeof displayNewsResultSchema>;

/**
 * A tool result that has been parsed and is safe to render, discriminated on
 * the tool that produced it. The renderer switches on `toolName` and gets
 * fully-typed props with no narrowing of its own.
 */
export type ToolResult =
  | { toolName: "display_products"; result: DisplayProductsResult }
  | { toolName: "display_weather"; result: DisplayWeatherResult }
  | { toolName: "display_news"; result: DisplayNewsResult };

/**
 * JSON that arrived as text is parsed; anything else is passed through.
 *
 * Tool payloads cross two serialization boundaries — the tool's return value
 * becomes a `ToolMessage`'s string content, and the checkpoint stores that
 * string — so a given layer may be either an object or its JSON text
 * depending on which path delivered it.
 */
function jsonText<TSchema extends z.ZodType>(schema: TSchema): z.ZodType<z.output<TSchema>> {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return parseJsonText(value) ?? value;
  }, schema);
}

/** The payload itself, or a payload still inside its LangChain envelope. */
const toolPayloadSchema = jsonText(
  z.union([
    z
      .object({ kwargs: jsonText(z.object({ content: jsonText(z.looseObject({})) })) })
      .transform((envelope) => envelope.kwargs.content),
    z.looseObject({}),
  ]),
);

/**
 * The tool this name refers to, or `null` if this app does not own it.
 *
 * The AI SDK reports a dynamic tool under the name the provider used, and the
 * hyphenated spelling shows up alongside the underscored one, so the two are
 * folded together here — once, rather than at each switch over tool names.
 */
export function parseToolName(toolName: string): ToolName | null {
  const parsed = toolNameSchema.safeParse(toolName.replaceAll("-", "_"));
  return parsed.success ? parsed.data : null;
}

/**
 * Parses a transport payload into a renderable result, or returns `null` when
 * the tool is not one this app renders or the payload does not match its
 * contract. This is the only place a tool payload is narrowed.
 */
export function parseToolResult(toolName: string, output: unknown): ToolResult | null {
  const name = parseToolName(toolName);
  if (name === null) return null;

  const payload = toolPayloadSchema.safeParse(output);
  if (!payload.success) return null;

  switch (name) {
    case "display_products": {
      const result = displayProductsResultSchema.safeParse(payload.data);
      return result.success ? { toolName: "display_products", result: result.data } : null;
    }
    case "display_weather": {
      const result = displayWeatherResultSchema.safeParse(payload.data);
      return result.success ? { toolName: "display_weather", result: result.data } : null;
    }
    case "display_news": {
      const result = displayNewsResultSchema.safeParse(payload.data);
      return result.success ? { toolName: "display_news", result: result.data } : null;
    }
  }
}
