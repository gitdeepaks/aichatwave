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
 * What it *does* own is transport security: the CSP nonce and the response
 * security headers, which have to be set before the response exists and so
 * have nowhere else to live. See `lib/security/security-headers.ts` for what
 * each directive is for.
 */

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthorizedParties } from "@/lib/security/authorized-parties";
import { buildSecurityHeaders, generateNonce } from "@/lib/security/security-headers";

/**
 * Origins whose Clerk session tokens this deployment accepts.
 *
 * Every hostname the deployment answers on has to be named here, or the check
 * locks out the users it was meant to protect — see
 * `lib/security/authorized-parties.ts` for why a partial list is worse than
 * none.
 */
function authorizedParties(): string[] {
  return resolveAuthorizedParties({
    NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
    VERCEL_PROJECT_PRODUCTION_URL: process.env["VERCEL_PROJECT_PRODUCTION_URL"],
    VERCEL_URL: process.env["VERCEL_URL"],
    VERCEL_BRANCH_URL: process.env["VERCEL_BRANCH_URL"],
  });
}

/** Report-only lets an operator watch for violations before enforcing. */
function isReportOnly(): boolean {
  return process.env["CSP_REPORT_ONLY"] === "true";
}

function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto !== undefined && forwardedProto.length > 0) {
    return forwardedProto === "https";
  }
  return request.nextUrl.protocol === "https:";
}

export default clerkMiddleware(
  (_auth, request) => {
    const nonce = generateNonce();
    const headers = buildSecurityHeaders({
      nonce,
      isDevelopment: process.env.NODE_ENV !== "production",
      isSecure: isSecureRequest(request),
      reportOnly: isReportOnly(),
    });

    // The CSP has to go onto the *request* headers too, not just the response.
    // Next.js discovers the nonce by reading the inbound
    // `content-security-policy` header and then stamps it on every script tag
    // it renders; without this the page ships a policy whose nonce matches
    // nothing and no script runs at all.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    for (const [name, value] of headers) {
      if (name.startsWith("content-security-policy")) requestHeaders.set(name, value);
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-nonce", nonce);
    for (const [name, value] of headers) {
      response.headers.set(name, value);
    }

    return response;
  },
  {
    authorizedParties: authorizedParties(),
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
