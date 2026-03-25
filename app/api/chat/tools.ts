import { tool } from "@langchain/core/tools";
import * as z from "zod";

export const productTool = tool(
  async ({ query }: { query: string }) => {
    console.log("query", query);
    return "no Product found";
  },
  {
    name: "display_products",
    description:
      "Search for real eCommerce products with prices and display them in a carousel in details, Always call this tool when user searces for any product",
    schema: z.object({
      location: z.string().describe("The product to search for e.g. 'iphone 17 pro max'"),
    }),
  },
);

export const tools = [productTool];
