/**
 * Every in-app URL this product links to, in one place.
 *
 * Client-safe: string literals and pure builders, nothing else.
 *
 * It exists because Phase J moved the workspace from `/` to `/app` so a public
 * landing page could live at the root. That move touched a dozen `href="/"`
 * and `router.push(`/chat/${id}`)` literals scattered across components, and
 * every one of them was a silent 404 if missed — a broken link does not fail a
 * build, a typecheck or a test. Naming them here makes the next such move a
 * single edit, and `AppRoute` makes a typo a compile error.
 *
 * The public/private split is not decoration. `PUBLIC_ROUTES` is what
 * `app/sitemap.ts` indexes and `app/robots.ts` allows; `WORKSPACE_PREFIX` is
 * what it disallows. Deriving both from this module is what keeps a new
 * authenticated route from being crawled because someone forgot to add it to a
 * `Disallow` list.
 */

/** Everything below this prefix requires a session. */
export const WORKSPACE_PREFIX = "/app";

export const ROUTES = {
  /** Public marketing surfaces. */
  home: "/",
  pricing: "/pricing",

  /** Authentication, public by necessity but never indexed. */
  signIn: "/sign-in",
  signUp: "/sign-up",

  /** The workspace. */
  app: WORKSPACE_PREFIX,
  memories: `${WORKSPACE_PREFIX}/memories`,
  profile: `${WORKSPACE_PREFIX}/profile`,
  checkoutSuccess: `${WORKSPACE_PREFIX}/success`,
  adminOperations: `${WORKSPACE_PREFIX}/admin/operations`,
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * A thread's conversation URL.
 *
 * Encoded here rather than at each call site: a thread id is a UUID today, but
 * the encoding is what stops a future id format from producing a URL that
 * parses as a different route.
 */
export function chatRoute(threadId: string): string {
  return `${WORKSPACE_PREFIX}/chat/${encodeURIComponent(threadId)}`;
}

/** Whether `pathname` addresses a thread. Used for active-state and post-delete navigation. */
export function isChatRoute(pathname: string, threadId: string): boolean {
  return pathname === chatRoute(threadId);
}

/**
 * The routes a crawler should see, with the priority and change frequency the
 * sitemap declares for each.
 *
 * Auth screens are deliberately absent: they are public, but indexing a
 * sign-in form gains nothing and splits the landing page's relevance.
 */
export const PUBLIC_ROUTES = [
  { path: ROUTES.home, changeFrequency: "weekly", priority: 1 },
  { path: ROUTES.pricing, changeFrequency: "monthly", priority: 0.8 },
] as const satisfies ReadonlyArray<{
  path: AppRoute;
  changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}>;

/**
 * Path prefixes no crawler should follow.
 *
 * `/api` and `/app` are the substance; the auth screens are here rather than
 * in a `noindex` meta tag alone because Clerk owns their markup and the
 * robots rule is the part this app controls.
 */
export const DISALLOWED_CRAWL_PREFIXES = [
  "/api/",
  `${WORKSPACE_PREFIX}/`,
  WORKSPACE_PREFIX,
  ROUTES.signIn,
  ROUTES.signUp,
] as const;

/** Absolute URL for a path, given the deployment origin. */
export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}
