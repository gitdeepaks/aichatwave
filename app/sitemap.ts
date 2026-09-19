import type { MetadataRoute } from "next";

import { appUrl } from "@/lib/env";
import { absoluteUrl, PUBLIC_ROUTES } from "@/lib/routes";

/**
 * `/sitemap.xml`.
 *
 * Only the two public routes. Nothing under `/app` is listed — a sitemap entry
 * for a page that redirects to sign-in is a crawl error volunteered.
 *
 * `lastModified` is the build time rather than `new Date()` at request time.
 * The distinction matters: a sitemap whose `lastmod` is always "now" tells a
 * crawler every page changed on every fetch, which is exactly the signal that
 * gets `lastmod` ignored. These pages change when the deployment changes, and
 * a module constant evaluated once per build is that date.
 *
 * One thing to know about the origin: this file is cached (it reads no
 * request-time API), so `appUrl()` resolves at **build** time and the hostname
 * is baked into the output. On Vercel that is correct as long as
 * `NEXT_PUBLIC_APP_URL` is set as a build variable — and it is currently not,
 * which means these files would name the deployment-specific `$VERCEL_URL`
 * instead of the real domain. See Deployment state item 1 in `docs/pro_plan.md`.
 */
const BUILT_AT = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = appUrl();

  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(origin, route.path),
    lastModified: BUILT_AT,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
