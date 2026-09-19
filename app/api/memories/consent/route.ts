import { updateMemoryConsentRequestSchema, type MemoryConsentResponse } from "@/lib/api/contracts";
import { toMemoryConsentDto } from "@/server/api/dto";
import { ensureUserProvisioned } from "@/server/auth/user-service";
import { readMemoryConsent, setMemoryConsent } from "@/server/memory/memory-consent-service";
import {
  createRouteHandler,
  jsonResponse,
  noBody,
  noParams,
  noQuery,
} from "@/server/lib/route-handler";

/**
 * Read and record long-term memory consent.
 *
 * `PUT` and not `POST`: recording a decision is idempotent and replaces
 * whatever was there, which is what `PUT` means. Re-granting an existing grant
 * moves the timestamp and nothing else.
 *
 * `ensureUserProvisioned` runs before the write because this can be the very
 * first thing a new account does — the onboarding dialog appears before the
 * first message, and the `user` row is otherwise created just-in-time on that
 * message. Without it the update would match no row and silently record
 * nothing.
 */
export const GET = createRouteHandler({
  name: "GET /api/memories/consent",
  params: noParams,
  query: noQuery,
  body: noBody,
  handler: async ({ userId }) => {
    const response: MemoryConsentResponse = toMemoryConsentDto(await readMemoryConsent(userId));
    return jsonResponse(response);
  },
});

export const PUT = createRouteHandler({
  name: "PUT /api/memories/consent",
  params: noParams,
  query: noQuery,
  body: updateMemoryConsentRequestSchema,
  handler: async ({ userId, body, log }) => {
    await ensureUserProvisioned(userId, log);
    const consent = await setMemoryConsent({ userId, decision: body.decision, log });
    const response: MemoryConsentResponse = toMemoryConsentDto(consent);
    return jsonResponse(response);
  },
});
