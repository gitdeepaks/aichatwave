/**
 * Attachments as the rest of the app sees them: bytes for the model, bytes for
 * the browser, and a policy check before either.
 *
 * The bytes live in Postgres (see `db/schema/chat-schema.ts`), so both callers
 * are a row read on a connection the request already holds — no second system,
 * no signed URL, and no window in which a link works without a session.
 */

import { randomUUID } from "node:crypto";
import {
  attachmentKindOf,
  MAX_ATTACHMENTS_PER_MESSAGE,
  rejectAttachment,
} from "@/lib/ai/attachments";
import { modelAcceptsAttachmentKind, type ModelId } from "@/lib/ai/model-registry";
import { buildAttachmentBlock, type AttachmentContentBlock } from "@/lib/ai/attachment-blocks";
import type { FilePart } from "@/lib/ai/message-parts";
import {
  createAttachment,
  deleteOrphanedAttachments,
  listAttachmentsForUser,
  readAttachmentBytes,
  type AttachmentBytes,
  type AttachmentRecord,
} from "@/server/db/attachment-repository";
import { assertAccountActive } from "@/server/account/account-deletion-service";
import { ensureUserProvisioned } from "@/server/auth/user-service";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/**
 * Stores an upload, after checking it against the policy one last time.
 *
 * The client checked the same rules before sending, and the client's check is
 * a convenience: this one is the control. The size is measured from the
 * decoded bytes rather than taken from the request, because a caller that
 * lies about a file's size is exactly the caller a limit exists for.
 */
export async function storeAttachment(params: {
  userId: string;
  filename: string;
  mediaType: string;
  data: Buffer;
  log?: Logger;
}): Promise<AttachmentRecord> {
  const log = params.log ?? rootLogger;

  const rejection = rejectAttachment({
    mediaType: params.mediaType,
    sizeBytes: params.data.byteLength,
  });
  if (rejection !== null) {
    throw new AppError("INVALID_REQUEST", rejection.message);
  }

  await assertAccountActive(params.userId);
  // The attachment row references `user.id`, and Clerk's `user.created` webhook
  // is asynchronous — the same race the chat write path guards.
  await ensureUserProvisioned(params.userId, log);

  const record = await createAttachment({
    id: randomUUID(),
    userId: params.userId,
    filename: params.filename,
    mediaType: params.mediaType,
    data: params.data,
  });

  log.info("attachment.stored", {
    attachmentId: record.id,
    mediaType: record.mediaType,
    sizeBytes: record.sizeBytes,
  });
  return record;
}

/** The file itself, for the route that serves it. Throws a typed 404 when absent. */
export async function readAttachmentForUser(params: {
  attachmentId: string;
  userId: string;
}): Promise<AttachmentBytes> {
  const record = await readAttachmentBytes(params);
  if (record === null) {
    throw new AppError("NOT_FOUND", "That attachment no longer exists.");
  }
  return record;
}

/**
 * Validates the attachments a turn claims, against ownership *and* the model.
 *
 * Every id is re-read from the database rather than trusted from the request:
 * the client sends ids, and an id is only an id. An id the user does not own
 * is a 403, not a silently dropped file — quietly answering without an
 * attachment the user believes they sent is worse than refusing.
 */
export async function resolveTurnAttachments(params: {
  attachmentIds: string[];
  userId: string;
  modelId: ModelId;
}): Promise<AttachmentRecord[]> {
  if (params.attachmentIds.length === 0) return [];

  if (params.attachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AppError(
      "INVALID_REQUEST",
      `A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments.`,
    );
  }

  const records = await listAttachmentsForUser({
    attachmentIds: params.attachmentIds,
    userId: params.userId,
  });

  if (records.length !== params.attachmentIds.length) {
    throw new AppError("FORBIDDEN", "One of those attachments isn't available.");
  }

  for (const record of records) {
    const rejection = rejectAttachment({
      mediaType: record.mediaType,
      sizeBytes: record.sizeBytes,
      modelAccepts: (kind) => modelAcceptsAttachmentKind(params.modelId, kind),
    });
    if (rejection !== null) {
      throw new AppError("INVALID_REQUEST", rejection.message);
    }
  }

  return records;
}

/**
 * Reads each attachment as a model content block.
 *
 * Done once per turn and held in the turn record, not once per graph node: a
 * tool loop re-enters `llmCall` several times and re-reading a three-megabyte
 * PDF on each pass would add latency and a failure mode to every one of them.
 *
 * A file that cannot be read is logged and dropped, and the model is told in
 * text that it was unavailable — a better answer than a 500 on a question that
 * was mostly text.
 */
export async function loadAttachmentBlocks(params: {
  records: AttachmentRecord[];
  userId: string;
  log?: Logger;
}): Promise<{ blocks: AttachmentContentBlock[]; unavailable: string[] }> {
  const log = params.log ?? rootLogger;
  const blocks: AttachmentContentBlock[] = [];
  const unavailable: string[] = [];

  const loaded = await Promise.all(
    params.records.map(async (record) => {
      try {
        const bytes = await readAttachmentBytes({
          attachmentId: record.id,
          userId: params.userId,
        });
        return { record, bytes };
      } catch (error) {
        log.error("attachment.read_failed", { attachmentId: record.id }, error);
        return { record, bytes: null };
      }
    }),
  );

  for (const entry of loaded) {
    const kind = attachmentKindOf(entry.record.mediaType);
    if (entry.bytes === null || kind === null) {
      unavailable.push(entry.record.filename);
      continue;
    }
    blocks.push(
      buildAttachmentBlock({
        kind,
        mediaType: entry.record.mediaType,
        data: entry.bytes.data.toString("base64"),
        filename: entry.record.filename,
      }),
    );
  }

  return { blocks, unavailable };
}

/** The persisted reference shape, written into the user message's parts. */
export function toFilePart(record: AttachmentRecord): FilePart {
  return {
    type: "file",
    attachmentId: record.id,
    filename: record.filename,
    mediaType: record.mediaType,
    sizeBytes: record.sizeBytes,
  };
}

/**
 * The line the model sees in place of an attachment it is not being shown.
 *
 * Only the newest user message carries real bytes (see
 * `hydrateLatestAttachments` in the agent). Older turns keep a text note so
 * the conversation still reads coherently — "the chart you sent" resolves to
 * something — without re-sending megabytes on every turn and without growing
 * the checkpoint by the size of the file.
 */
export function describeAttachments(fileParts: FilePart[]): string {
  if (fileParts.length === 0) return "";
  const listed = fileParts.map((part) => `${part.filename} (${part.mediaType})`).join(", ");
  return `[Attached earlier in this conversation, not re-sent: ${listed}]`;
}

/** A file whose upload was never sent is dropped after this long. */
const ORPHAN_GRACE_MS = 6 * 60 * 60 * 1000;
const ORPHAN_SWEEP_LIMIT = 25;

/**
 * Drops uploads that were never attached to a message. Never throws — it runs
 * behind the response and must not turn a cleanup failure into a failed turn.
 */
export async function sweepAttachments(now: Date, log: Logger = rootLogger): Promise<void> {
  try {
    const dropped = await deleteOrphanedAttachments({
      before: new Date(now.getTime() - ORPHAN_GRACE_MS),
      limit: ORPHAN_SWEEP_LIMIT,
    });
    if (dropped > 0) log.info("attachment.orphans_deleted", { count: dropped });
  } catch (error) {
    log.error("attachment.sweep_failed", {}, error);
  }
}

/** Probability that a given chat turn also pays for a sweep. Off the response path. */
export const ATTACHMENT_SWEEP_PROBABILITY = 0.02;

export function shouldSweepAttachments(): boolean {
  return Math.random() < ATTACHMENT_SWEEP_PROBABILITY;
}

export type { AttachmentContentBlock };
