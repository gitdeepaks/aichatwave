import type { JsonObject } from "@/lib/json";
import { serializeJsonLd } from "@/lib/seo/json-ld";

/**
 * Renders a structured-data graph as an inline `<script type="application/ld+json">`.
 *
 * A plain `<script>` and not `next/script`: JSON-LD is data, not code, and the
 * loading strategies `next/script` exists to manage do not apply to a payload
 * the browser never executes.
 *
 * `dangerouslySetInnerHTML` is unavoidable — React escapes text children, which
 * would corrupt the JSON — so the escaping is done at the one place that
 * produces the string. See `serializeJsonLd`, which replaces `<` so a value can
 * never close this tag.
 *
 * The graph is nonce-free on purpose. `script-src` in this app carries
 * `'strict-dynamic'`, which means the nonce is what makes a script *execute*;
 * a `type="application/ld+json"` block is a data block that no browser
 * executes, so there is nothing for a nonce to authorize. Giving it one would
 * imply otherwise.
 */
export function JsonLd({ documents }: Readonly<{ documents: readonly JsonObject[] }>) {
  if (documents.length === 0) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(documents) }}
    />
  );
}
