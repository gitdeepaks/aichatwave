import assert from "node:assert/strict";
import test from "node:test";
import {
  displayNewsResultSchema,
  displayProductsResultSchema,
  displayWeatherResultSchema,
  parseToolResult,
  type DisplayNewsResult,
  type DisplayProductsResult,
  type DisplayWeatherResult,
} from "@/lib/ai/tool-contracts";

const products: DisplayProductsResult = {
  query: "iphone 17",
  products: [
    {
      id: "p1",
      title: "iPhone 17 Pro",
      description: "Apple Store",
      price: 1299.99,
      rating: 4.6,
      thumbnail: "https://example.test/p1.jpg",
      productLink: "https://example.test/p1",
    },
  ],
};

const weather: DisplayWeatherResult = {
  location: "Mumbai, India",
  temperature: 31,
  feelsLike: 35,
  humidity: 70,
  windSpeed: 9,
  isDay: true,
  weatherCode: 3,
  hourly: [{ time: "3 PM", temperature: 31, weatherCode: 3 }],
  daily: [{ day: "Mon", min: 27, max: 33, weatherCode: 3 }],
};

const news: DisplayNewsResult = {
  query: "AAPL",
  news: [
    {
      uuid: "n1",
      title: "Apple ships something",
      publisher: "Example Wire",
      link: "https://example.test/n1",
      publishTime: "1/1/2026, 9:00:00 AM",
      thumbnail: null,
    },
  ],
  summary: "One headline.",
};

test("each tool result round-trips through its own schema", () => {
  assert.deepEqual(displayProductsResultSchema.parse(products), products);
  assert.deepEqual(displayWeatherResultSchema.parse(weather), weather);
  assert.deepEqual(displayNewsResultSchema.parse(news), news);
});

test("optional fields may be absent but not the required ones", () => {
  const minimal = { query: "socks", products: [] };
  assert.deepEqual(displayProductsResultSchema.parse(minimal), minimal);

  assert.equal(displayProductsResultSchema.safeParse({ products: [] }).success, false);
  assert.equal(displayNewsResultSchema.safeParse({ query: "AAPL" }).success, false);
  assert.equal(
    displayWeatherResultSchema.safeParse({ ...weather, temperature: undefined }).success,
    false,
  );
});

test("a field of the wrong type is a rejection, not a coercion", () => {
  const stringPrice = {
    ...products,
    products: [{ ...products.products[0], price: "1,299.99" }],
  };
  assert.equal(displayProductsResultSchema.safeParse(stringPrice).success, false);

  assert.equal(displayWeatherResultSchema.safeParse({ ...weather, isDay: 1 }).success, false);
  assert.equal(
    displayNewsResultSchema.safeParse({ ...news, news: [{ ...news.news[0], thumbnail: 12 }] })
      .success,
    false,
  );
});

test("empty strings are rejected where an id or title is required", () => {
  assert.equal(
    displayProductsResultSchema.safeParse({
      ...products,
      products: [{ ...products.products[0], id: "" }],
    }).success,
    false,
  );
  assert.equal(
    displayNewsResultSchema.safeParse({ ...news, news: [{ ...news.news[0], link: "" }] }).success,
    false,
  );
});

test("parseToolResult reads a bare payload", () => {
  const result = parseToolResult("display_weather", weather);
  assert.deepEqual(result, { toolName: "display_weather", result: weather });
});

test("parseToolResult unwraps the LangChain envelope, JSON text at either layer", () => {
  const wrapped = { kwargs: { content: JSON.stringify(news) } };
  assert.deepEqual(parseToolResult("display_news", wrapped), {
    toolName: "display_news",
    result: news,
  });

  assert.deepEqual(parseToolResult("display_news", JSON.stringify(wrapped)), {
    toolName: "display_news",
    result: news,
  });

  assert.deepEqual(parseToolResult("display_news", JSON.stringify(news)), {
    toolName: "display_news",
    result: news,
  });
});

test("parseToolResult accepts the hyphenated tool name the SDK sometimes reports", () => {
  assert.deepEqual(parseToolResult("display-products", products), {
    toolName: "display_products",
    result: products,
  });
});

test("parseToolResult returns null rather than a half-read card", () => {
  assert.equal(parseToolResult("display_bananas", products), null);
  assert.equal(parseToolResult("display_weather", { location: "Mumbai" }), null);
  assert.equal(parseToolResult("display_news", "not json at all"), null);
  assert.equal(parseToolResult("display_products", undefined), null);
  assert.equal(parseToolResult("display_products", null), null);
});

test("a payload for one tool does not satisfy another", () => {
  assert.equal(parseToolResult("display_weather", news), null);
  assert.equal(parseToolResult("display_products", weather), null);
});
