import type { MetadataRoute } from "next";

import { appUrl } from "@/lib/env";
import { absoluteUrl, DISALLOWED_CRAWL_PREFIXES } from "@/lib/routes";

/**
 * `/robots.txt`.
 *
 * The disallow list is derived from `lib/routes.ts` rather than written out
 * here, so adding an authenticated route cannot quietly make it crawlable.
 * Every one of those routes is behind `auth.protect()` or a session check and
 * would serve a redirect to a crawler anyway — this is the layer that stops
 * the crawl budget being spent discovering that.
 *
 * `/api/` is disallowed for a different reason: those routes answer, they just
 * answer 401. An indexed 401 body is not a security problem, it is noise in
 * someone's search results.
 *
 * Cached by default — nothing here reads a request-time API, and the contents
 * only change when the route table does, which is a deploy.
 *
 * One thing to know about the origin: this file is cached (it reads no
 * request-time API), so `appUrl()` resolves at **build** time and the hostname
 * is baked into the output. On Vercel that is correct as long as
 * `NEXT_PUBLIC_APP_URL` is set as a build variable — and it is currently not,
 * which means these files would name the deployment-specific `$VERCEL_URL`
 * instead of the real domain. See Deployment state item 1 in `docs/pro_plan.md`.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = appUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...DISALLOWED_CRAWL_PREFIXES],
    },
    sitemap: absoluteUrl(origin, "/sitemap.xml"),
    host: origin,
  };
}
