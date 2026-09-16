/**
 * How a streamed turn ended, shared by the database enum, the reconnect
 * endpoint, and the client.
 *
 * `aborted` is a first-class outcome rather than a flavour of `failed`: the
 * user pressed stop, the partial answer is kept, and nothing about it is an
 * error to report. Keeping them distinct is what lets the renderer label an
 * interrupted answer honestly instead of showing a failure the user caused on
 * purpose.
 *
 * Client-safe: one tuple, one schema, one type.
 */

import { z } from "zod";

export const CHAT_STREAM_STATES = ["streaming", "completed", "aborted", "failed"] as const;
export const chatStreamStateSchema = z.enum(CHAT_STREAM_STATES);
export type ChatStreamState = z.infer<typeof chatStreamStateSchema>;

/** The states in which no further chunks will ever be written. */
export function isSettledStreamState(state: ChatStreamState): boolean {
  return state !== "streaming";
}

/**
 * How long a `streaming` row may go without a heartbeat before a reader treats
 * it as dead.
 *
 * A stream whose process was killed never writes its settled state, so the row
 * would otherwise say "streaming" forever and every reconnect would hang
 * waiting for chunks that cannot arrive. Generous relative to the flush
 * interval — a model that thinks for a while between tokens is normal.
 */
export const STREAM_HEARTBEAT_TIMEOUT_MS = 90_000;

/** How long a settled stream's replay log is kept before the sweeper drops it. */
export const STREAM_RETENTION_MS = 60 * 60 * 1000;
