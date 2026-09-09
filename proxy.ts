/**
 * Clerk middleware. Named `proxy.ts` because this app is on Next.js 16 —
 * on Next.js 15 and below the same file is `middleware.ts`.
 *
 * Deliberately contains no authorization logic. Clerk deprecates
 * `createRouteMatcher()` gating here because middleware auth can be bypassed:
 * Server Functions are invoked by id rather than path, and path normalization
 * between the matcher and the router can diverge, so a matcher gives a false
 * sense of security.
 *
 * Authorization is therefore enforced at each resource instead:
 *   - pages/layouts  → `auth.protect()` in `app/(chat)/layout.tsx`
 *   - API routes     → `requireSessionUserId()` inside `createRouteHandler`
 *   - server actions → `getSessionUserId()` in `lib/polar.ts`
 *   - data access    → every repository query is scoped by `user_id`
 *
 * This middleware's only job is to make `auth()` available to all of them.
 */

import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
