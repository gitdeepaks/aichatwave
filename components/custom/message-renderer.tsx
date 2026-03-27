import {
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Message } from "@/components/ai-elements/message";
import { ProductCarousel, type Product as CarouselProduct } from "@/components/gen-ui/product-carousel";
import type { UIMessage } from "ai";
import { CopyIcon, RefreshCcwIcon } from "lucide-react";
import { Fragment } from "react";

type DisplayProductsPayload = {
  query?: string;
  products?: unknown[];
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
