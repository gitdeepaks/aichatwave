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
  /** Set deliberately by an operator; already carries a scheme. */
  NEXT_PUBLIC_APP_URL?: string | undefined;
  /** Vercel: the project's production domain, e.g. `www.aichatwave.in`. */
  VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  /** Vercel: this specific deployment's hostname. Not the custom domain. */
  VERCEL_URL?: string | undefined;
  /** Vercel: the branch alias for preview deployments. */
  VERCEL_BRANCH_URL?: string | undefined;
};

export function resolveAuthorizedParties(env: AuthorizedPartiesEnv): string[] {
  const origins = [
    env.NEXT_PUBLIC_APP_URL,
    withProtocol(env.VERCEL_PROJECT_PRODUCTION_URL),
    withProtocol(env.VERCEL_URL),
    withProtocol(env.VERCEL_BRANCH_URL),
  ];

  return [
    ...new Set(
      origins
        .filter((origin): origin is string => origin !== undefined && origin.length > 0)
        // `azp` never carries a trailing slash, so neither may this list.
        .map((origin) => origin.replace(/\/+$/, "")),
    ),
  ];
}

/** Vercel's host variables carry no scheme; `NEXT_PUBLIC_APP_URL` already does. */
function withProtocol(host: string | undefined): string | undefined {
  if (host === undefined || host.length === 0) return undefined;
  return host.startsWith("http") ? host : `https://${host}`;
}
