/**
 * Pulls the actionable parts out of a Polar SDK error.
 *
 * The SDK throws `SDKError` with the upstream status and the raw JSON body
 * folded into `message`. That means a failure like an expired token reaches the
 * logs only as prose inside one long string — greppable by luck, not by field.
 * Lifting status and error code into structured fields makes the difference
 * between "checkout is broken" and "the token is revoked" visible at a glance,
 * and alertable.
 */

import { z } from "zod";
import { parseJsonText } from "@/lib/json";

/** Polar returns OAuth-style errors for auth failures. */
const oauthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/** …and FastAPI-style validation errors for bad payloads. */
const detailErrorSchema = z.object({
  detail: z.union([
    z.string(),
    z.array(
      z.object({ loc: z.array(z.union([z.string(), z.number()])).optional(), msg: z.string() }),
    ),
  ]),
});

export type PolarErrorFacts = {
  upstreamStatus: number | null;
  upstreamCode: string | null;
  upstreamDetail: string | null;
};

function readBody(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("body" in error)) return null;
  const body = error.body;
  return typeof body === "string" ? body : null;
}

function readStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("statusCode" in error)) return null;
  const status = error.statusCode;
  return typeof status === "number" ? status : null;
}

/** Never throws: diagnostics must not become a second failure. */
export function polarErrorFacts(error: unknown): PolarErrorFacts {
  const upstreamStatus = readStatus(error);
  const raw = readBody(error);

  if (raw === null) {
    return { upstreamStatus, upstreamCode: null, upstreamDetail: null };
  }

  const parsed = parseJsonText(raw);
  if (parsed === null) {
    return { upstreamStatus, upstreamCode: null, upstreamDetail: raw.slice(0, 200) };
  }

  const oauth = oauthErrorSchema.safeParse(parsed);
  if (oauth.success) {
    return {
      upstreamStatus,
      upstreamCode: oauth.data.error,
      upstreamDetail: oauth.data.error_description ?? null,
    };
  }

  const detail = detailErrorSchema.safeParse(parsed);
  if (detail.success) {
    const text =
      typeof detail.data.detail === "string"
        ? detail.data.detail
        : detail.data.detail.map((item) => `${(item.loc ?? []).join(".")}: ${item.msg}`).join("; ");
    return { upstreamStatus, upstreamCode: "validation_error", upstreamDetail: text.slice(0, 200) };
  }

  return { upstreamStatus, upstreamCode: null, upstreamDetail: raw.slice(0, 200) };
}

/**
 * True when Polar rejected our credentials rather than our request. This is an
 * operator problem (wrong or revoked token, or the wrong `POLAR_SERVER`), not
 * something the user can retry their way out of.
 */
export function isPolarAuthFailure(error: unknown): boolean {
  const facts = polarErrorFacts(error);
  return facts.upstreamStatus === 401 || facts.upstreamCode === "invalid_token";
}
