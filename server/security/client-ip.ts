/**
 * Resolving the caller's IP from proxy headers.
 *
 * Every header read here is client-controllable in principle, so the honest
 * framing is: this is only as trustworthy as the proxy in front of the app.
 * On Vercel, `x-vercel-forwarded-for` is set by the platform and any inbound
 * copy is overwritten, which is why it is preferred outright. `x-forwarded-for`
 * is a client-appendable list, so only the *first* entry — the one the edge
 * itself recorded — is read, never the last.
 *
 * A spoofed value cannot raise a limit; at worst it moves the caller to a
 * different bucket, which is why per-IP limiting is a supplement to per-user
 * limiting and never a substitute for it.
 */

import { z } from "zod";

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

/**
 * Headers in preference order. The platform-set header wins, then the first
 * hop the edge recorded, then single-value forms used by nginx and Cloudflare.
 */
const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
] as const;

/**
 * The caller's IP, or null when no proxy header carries a usable one.
 *
 * Null is a real outcome — a direct request to a local dev server has no
 * forwarding headers at all — and callers must treat it as "cannot limit by
 * IP" rather than inventing a placeholder key, which would put every such
 * request in one shared bucket and rate-limit localhost against itself.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  for (const header of IP_HEADERS) {
    const raw = headers.get(header);
    if (raw === null) continue;

    const first = raw.split(",")[0]?.trim();
    if (first === undefined || first.length === 0) continue;

    const parsed = ipSchema.safeParse(stripPort(first));
    if (parsed.success) return parsed.data;
  }

  return null;
}

/**
 * Some proxies append a source port (`203.0.113.7:54321`). IPv6 is left alone:
 * it is full of colons already, and a bracketed `[::1]:443` form is unwrapped
 * explicitly rather than by guessing at the last colon.
 */
function stripPort(value: string): string {
  const bracketed = /^\[(?<address>[^\]]+)\](?::\d+)?$/u.exec(value);
  const address = bracketed?.groups?.["address"];
  if (address !== undefined) return address;

  const parts = value.split(":");
  if (parts.length === 2 && parts[0] !== undefined) return parts[0];

  return value;
}
