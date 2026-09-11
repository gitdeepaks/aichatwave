/**
 * Cross-origin write protection for the HTTP API.
 *
 * The app's cookies are Clerk's, and they are sent on cross-site requests the
 * browser considers same-site-lax — which does not include a cross-site POST,
 * so the exposure here is narrow. It is not zero: `SameSite=None` cookies, a
 * subdomain the app does not control, and a misconfigured CDN all reopen it,
 * and a forged POST to `/api/billing/checkout` would burn a Polar API call per
 * request even though the attacker cannot read the response.
 *
 * So: reject a write whose `Origin` names a host this deployment does not
 * serve. Absence is allowed — a non-browser client (curl, a health checker, a
 * server-to-server call) sends no `Origin` and also carries no ambient
 * cookies, so demanding the header would break honest clients without closing
 * anything. This mirrors how Next.js itself guards Server Actions.
 */

import { AppError } from "@/server/lib/app-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * The hosts a request may legitimately claim to come from: whatever the proxy
 * says this request was addressed to, plus the deployment's configured origin.
 * Both are needed — preview deployments answer on a host the configured origin
 * does not name, and a proxy that drops `x-forwarded-host` leaves only the
 * configured one.
 */
function allowedHosts(params: { headers: Headers; appOrigin: string }): Set<string> {
  const hosts = new Set<string>();

  const forwardedHost = params.headers.get("x-forwarded-host")?.trim();
  if (forwardedHost) hosts.add(forwardedHost.toLowerCase());

  const host = params.headers.get("host")?.trim();
  if (host) hosts.add(host.toLowerCase());

  const configured = safeHost(params.appOrigin);
  if (configured !== null) hosts.add(configured);

  return hosts;
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Throws a typed 403 when a state-changing request declares a foreign origin.
 *
 * Compares hosts, not full origins: the scheme differs between the browser's
 * view (`https`) and a proxied `Host` header often enough that comparing them
 * produces false rejections on exactly the deployments that are configured
 * correctly.
 */
export function assertSameOrigin(params: {
  method: string;
  headers: Headers;
  appOrigin: string;
}): void {
  if (!isMutatingMethod(params.method)) return;

  const origin = params.headers.get("origin");
  if (origin === null || origin === "null") return;

  const originHost = safeHost(origin);
  if (originHost !== null && allowedHosts(params).has(originHost)) return;

  throw new AppError("FORBIDDEN", "This request came from an unrecognized origin.", {
    cause: new Error(`Rejected cross-origin ${params.method} from origin "${origin}".`),
  });
}
