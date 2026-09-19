/**
 * The origins whose Clerk session tokens this deployment accepts.
 *
 * Clerk compares a token's `azp` claim — the origin the browser was actually
 * on — against this list, which is what stops a token minted for another site
 * from being replayed here. Clerk skips the check entirely when the list is
 * empty.
 *
 * **A partial list is worse than no list.** Empty means "no restriction";
 * non-empty means "reject anything not named", and a list that omits the
 * hostname real users arrive on locks all of them out. That is not theoretical:
 * on Vercel the custom domain lives in `VERCEL_PROJECT_PRODUCTION_URL`, while
 * `VERCEL_URL` is the per-deployment hostname nobody visits. Listing only the
 * latter produces a confidently wrong list that rejects every production user
 * while passing every local test.
 *
 * Pure, and parameterised over the environment rather than reading
 * `process.env` directly, so the above can be tested instead of reasoned about.
 * It also runs in the edge middleware, so it must stay free of imports.
 */

export type AuthorizedPartiesEnv = {
  NODE_ENV?: string | undefined;
  /** Set deliberately by an operator; already carries a scheme. */
  NEXT_PUBLIC_APP_URL?: string | undefined;
  /** Vercel: the project's production domain, e.g. `www.aichatwave.in`. */
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  /** Vercel: this specific deployment's hostname. Not the custom domain. */
  VERCEL_URL?: string | undefined;
  /** Vercel: the branch alias for preview deployments. */
  VERCEL_BRANCH_URL?: string | undefined;
};

export function resolveAuthorizedParties(
  env: AuthorizedPartiesEnv,
  requestOrigin?: string,
): string[] {
  const origins = [
    env.NEXT_PUBLIC_APP_URL,
    withProtocol(env.VERCEL_PROJECT_PRODUCTION_URL),
    withProtocol(env.VERCEL_URL),
    withProtocol(env.VERCEL_BRANCH_URL),
    env.NODE_ENV === "development" ? requestOrigin : undefined,
  ];

  return [
    ...new Set(
      origins
        .filter((origin): origin is string => origin !== undefined && origin.length > 0)
        .map(toOrigin)
        .filter((origin): origin is string => origin !== undefined),
    ),
  ];
}

/**
 * Reduces a configured value to the exact origin Clerk will compare against.
 *
 * This is the load-bearing line, and it used to be `origin.replace(/\/+$/, "")`
 * — a trailing-slash trim on a string taken at face value, because
 * `NEXT_PUBLIC_APP_URL` is "set deliberately by an operator" and therefore
 * assumed well-formed. It is not a safe assumption, and the failure is total
 * and silent:
 *
 * `NEXT_PUBLIC_APP_URL=http:localhost:3000` — one `/` short, a plain typo —
 * survives `z.url()` in `lib/env.ts`, because the WHATWG parser reads it as
 * `http://localhost:3000/` quite happily. Every other consumer therefore works
 * fine. This one did not: the string went into the list verbatim, the browser's
 * `azp` claim is the *parsed* origin `http://localhost:3000`, the two are not
 * equal, and Clerk rejected every session. Server-side `auth()` saw no user
 * while the browser held a perfectly good one, so every protected route
 * bounced to sign-in and sign-in bounced back. Observed, not hypothesised.
 *
 * That is precisely the "confidently wrong list" this module's own header warns
 * about, arriving through a route the header did not anticipate.
 *
 * `.origin` and not `.href`: `azp` is an origin — scheme, host, port, nothing
 * else — so a path in the configured value must be dropped rather than
 * compared. An unparseable value yields `undefined` and is dropped, which is
 * the one case where dropping is right: a garbage entry cannot match anything,
 * and leaving it in only risks it being the entry that makes the list non-empty
 * and therefore enforcing.
 */
function toOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/** Vercel's host variables carry no scheme; `NEXT_PUBLIC_APP_URL` already does. */
function withProtocol(host: string | undefined): string | undefined {
  if (host === undefined || host.length === 0) return undefined;
  return host.startsWith("http") ? host : `https://${host}`;
}
