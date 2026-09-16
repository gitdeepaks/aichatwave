/**
 * The in-process record of a turn that is currently streaming.
 *
 * A turn spans two things that cannot see each other. The graph nodes know the
 * model and the token counts but not what reached the client; the stream knows
 * what reached the client but nothing about usage. Both belong to one request,
 * and both have to be in hand at settle time for the turn to be written once.
 *
 * The join is a branded `turnId` carried in the runtime context — which is
 * plain JSON, parsed by Zod on entry to every node — and this registry, which
 * maps that id to the mutable record. Nothing that must survive a process
 * restart lives here: the durable record of an in-flight turn is the
 * `chat_stream` row, and this is only what makes the two halves meet while the
 * request is alive.
 *
 * Entries are removed when the stream settles. `onStreamSettled` covers all
 * three exits a stream has, so the normal path always cleans up; the sweep
 * below is for the abnormal one, where a record would otherwise be retained
 * for the life of the process.
 */

import { randomUUID } from "node:crypto";
import type { ModelId } from "@/lib/ai/model-registry";
import type { AttachmentContentBlock } from "@/server/chat/attachment-service";
import type { AttachmentRecord } from "@/server/db/attachment-repository";
import { createTurnAccumulator, type TurnAccumulator } from "@/server/chat/turn-recorder";
import { turnIdSchema, type TurnId } from "@/server/chat/runtime-context";
import { logger } from "@/server/lib/logger";

export type TurnUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type TurnRecord = {
  readonly turnId: TurnId;
  /**
   * Stops this turn's generation.
   *
   * Deliberately *not* the request's own signal. Next aborts that when the
   * client disconnects, and a page refresh is a disconnect — wiring it to the
   * graph would tear down the answer at precisely the moment resumption exists
   * to recover it. Stop is therefore an explicit act (`DELETE
   * /api/chat/[threadId]/stream`), and closing the tab lets the answer finish
   * into the buffer where a reload can pick it up.
   */
  readonly abortController: AbortController;
  readonly streamId: string;
  readonly threadId: string;
  readonly userId: string;
  readonly userText: string;
  readonly attachments: AttachmentRecord[];
  /**
   * Attachment bytes as model content blocks, loaded once for the turn.
   *
   * Held here rather than fetched in the node because a tool loop re-enters
   * `llmCall` several times and a 10 MB PDF should be downloaded once per
   * turn, not once per pass.
   */
  readonly attachmentBlocks: AttachmentContentBlock[];
  /** Attachments that could not be fetched, named for the model in text. */
  readonly unavailableAttachments: string[];
  /** Replaces the last assistant turn instead of appending. Set by a regenerate. */
  readonly replacePrevious: boolean;
  readonly accumulator: TurnAccumulator;
  readonly startedAt: number;
  modelId: ModelId;
  usage: TurnUsage;
};

export type CreateTurnParams = Omit<
  TurnRecord,
  "turnId" | "accumulator" | "usage" | "startedAt" | "abortController"
>;

const turns = new Map<string, TurnRecord>();

/**
 * How long a record may live before the sweep reclaims it. Generous: it bounds
 * a leak, it does not bound a turn.
 */
const TURN_TTL_MS = 15 * 60 * 1000;

export function createTurnId(): TurnId {
  // Parsed rather than asserted: the brand exists precisely so that the only
  // way to hold a `TurnId` is to have validated one, and a cast here would
  // make that guarantee decorative.
  return turnIdSchema.parse(`turn_${randomUUID()}`);
}

export function registerTurn(turnId: TurnId, params: CreateTurnParams): TurnRecord {
  sweepExpiredTurns();

  const record: TurnRecord = {
    ...params,
    turnId,
    abortController: new AbortController(),
    accumulator: createTurnAccumulator(),
    startedAt: Date.now(),
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  turns.set(turnId, record);
  return record;
}

export function findTurn(turnId: TurnId): TurnRecord | null {
  return turns.get(turnId) ?? null;
}

export function releaseTurn(turnId: TurnId): TurnRecord | null {
  const record = turns.get(turnId) ?? null;
  turns.delete(turnId);
  return record;
}

/**
 * Adds a step's usage to the turn.
 *
 * Additive because a tool loop calls the model more than once and every call
 * is billed; the turn's cost is their sum, not the last one's. The model id is
 * overwritten rather than accumulated — it is the same for every step of a
 * turn, and taking the latest is correct if that ever stops being true.
 */
export function recordTurnUsage(
  turnId: TurnId,
  step: { modelId: ModelId; inputTokens: number; outputTokens: number },
): void {
  const record = turns.get(turnId);
  if (!record) return;

  record.modelId = step.modelId;
  record.usage = {
    inputTokens: record.usage.inputTokens + step.inputTokens,
    outputTokens: record.usage.outputTokens + step.outputTokens,
  };
}

function sweepExpiredTurns(): void {
  const cutoff = Date.now() - TURN_TTL_MS;
  for (const [turnId, record] of turns) {
    if (record.startedAt >= cutoff) continue;
    turns.delete(turnId);
    logger.warn("chat.turn_record_expired", {
      turnId,
      threadId: record.threadId,
      ageMs: Date.now() - record.startedAt,
    });
  }
}

/**
 * Stops a turn running in *this* process, and reports whether one was found.
 *
 * False is not a failure: in a multi-instance deployment the stop request can
 * land on an instance that is not running the stream. The caller then relies on
 * the database flag, which the streaming instance notices on its next buffer
 * flush — see `bufferStreamToDatabase`.
 */
export function abortTurnByStreamId(streamId: string): boolean {
  for (const record of turns.values()) {
    if (record.streamId !== streamId) continue;
    record.abortController.abort(new Error("Stopped by the user."));
    return true;
  }
  return false;
}

/** Test seam: the number of records currently held. */
export function turnRecordCount(): number {
  return turns.size;
}
