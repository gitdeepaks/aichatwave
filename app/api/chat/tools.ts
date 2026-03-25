import { tool } from "@langchain/core/tools";
import * as z from "zod";
import { getJson } from "serpapi";

type ProductFromAPI = {
  product_id: string;
  title: string;
  extracted_price: string;
  description: string;
  rating: number;
  thumnail: string;
  product_link: string;
};

type Product = {
  id: string;
  title: string;
  description: string;
  price: string;
  rating: number;
  thumnail: string;
  product_link: string;
};

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
            thumnail: product.thumnail,
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

export const tools = [productTool];
