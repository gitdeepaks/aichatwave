import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * The workspace moved from `/` to `/app` in Phase J so a public landing page
 * could occupy the root. Every URL a user has bookmarked, or that a previous
 * Polar checkout was told to return to, still points at the old shape — so the
 * old shape has to keep resolving.
 *
 * 308 rather than 307: these moves are permanent, and a permanent redirect is
 * what lets a browser stop asking and a crawler transfer the old URL's signals
 * to the new one. `/` is deliberately absent — it did not move, it changed
 * meaning, and redirecting it would make the landing page unreachable.
 *
 * `:path*` on the thread route carries the id through. A thread URL is the
 * link people actually share.
 */
const LEGACY_REDIRECTS = [
  { source: "/chat/:path*", destination: "/app/chat/:path*" },
  { source: "/memories", destination: "/app/memories" },
  { source: "/profile", destination: "/app/profile" },
  { source: "/success", destination: "/app/success" },
  { source: "/admin/:path*", destination: "/app/admin/:path*" },
] as const;

const nextConfig: NextConfig = {
  images: {
    maximumRedirects: 0,
    remotePatterns: [
      { protocol: "https", hostname: "encrypted-tbn0.gstatic.com" },
      { protocol: "https", hostname: "encrypted-tbn1.gstatic.com" },
      { protocol: "https", hostname: "encrypted-tbn2.gstatic.com" },
      { protocol: "https", hostname: "encrypted-tbn3.gstatic.com" },
      { protocol: "https", hostname: "media.zenfs.com" },
      { protocol: "https", hostname: "models.dev", pathname: "/logos/**" },
      { protocol: "https", hostname: "s.yimg.com" },
    ],
  },
  turbopack: {
    root: projectRoot,
  },
  redirects: () => Promise.resolve(LEGACY_REDIRECTS.map((rule) => ({ ...rule, permanent: true }))),
};

export default nextConfig;
