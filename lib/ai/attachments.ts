/**
 * What a user is allowed to attach to a message.
 *
 * One policy, read by three places that must agree: the composer (which
 * refuses a file before uploading it), the upload route (which refuses it
 * again, because a client check is a convenience and never a control), and the
 * model registry (which decides whether the selected model can read the file
 * at all).
 *
 * Client-safe: pure data and pure functions, no server imports.
 */

import { z } from "zod";

/** The two kinds of attachment this product understands. */
export const ATTACHMENT_KINDS = ["image", "pdf"] as const;
export const attachmentKindSchema = z.enum(ATTACHMENT_KINDS);
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;

/**
 * Accepted media types, keyed by kind.
 *
 * An allowlist rather than an `image/*` prefix test: the bytes are handed to a
 * provider and re-served under this app's own URL, so "anything claiming to be
 * an image" is not a category worth being in.
 */
export const ATTACHMENT_MEDIA_TYPES = {
  image: ["image/png", "image/jpeg", "image/webp", "image/gif"],
  pdf: ["application/pdf"],
} as const satisfies Record<AttachmentKind, readonly string[]>;

export const ATTACHMENT_MEDIA_TYPE_LIST: readonly string[] = [
  ...ATTACHMENT_MEDIA_TYPES.image,
  ...ATTACHMENT_MEDIA_TYPES.pdf,
];

/** The `accept` attribute for the composer's file input. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_MEDIA_TYPE_LIST.join(",");

/**
 * Per-kind byte ceilings.
 *
 * Sized by the *transport*, not by what a model can read. Attachment bytes are
 * stored in Postgres and therefore travel through this app's own API as
 * base64 inside a JSON body — which is 4/3 the size of the file — and a
 * serverless request body is capped at 4.5 MB on the platform this deploys to.
 * A 4 MB PDF would arrive as 5.3 MB of JSON and be rejected by the platform
 * before any code here ran, which is a failure with no good error message
 * available to it.
 *
 * So: 3 MB is the largest file whose encoded body stays comfortably under the
 * cap. Raising these means moving the bytes out of the request body — a
 * presigned upload straight to object storage — not raising the numbers.
 */
export const MAX_ATTACHMENT_BYTES = {
  image: 2 * 1024 * 1024,
  pdf: 3 * 1024 * 1024,
} as const satisfies Record<AttachmentKind, number>;

/**
 * The largest JSON body the upload route will accept, with base64's overhead
 * and a little room for the surrounding fields.
 */
export const MAX_UPLOAD_BODY_BYTES = Math.ceil((MAX_ATTACHMENT_BYTES.pdf * 4) / 3) + 4096;

/** How many files may ride along with one message. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

export function attachmentKindOf(mediaType: string): AttachmentKind | null {
  for (const kind of ATTACHMENT_KINDS) {
    const accepted: readonly string[] = ATTACHMENT_MEDIA_TYPES[kind];
    if (accepted.includes(mediaType)) return kind;
  }
  return null;
}

export function isAcceptedMediaType(mediaType: string): boolean {
  return attachmentKindOf(mediaType) !== null;
}

export type AttachmentRejection = {
  reason: "media-type" | "too-large" | "too-many" | "model-unsupported";
  message: string;
};

/**
 * Validates one candidate file against the policy and the selected model.
 *
 * Returns `null` when the file is acceptable, so a call site reads as
 * `const rejection = rejectAttachment(...); if (rejection) { … }`.
 */
export function rejectAttachment(candidate: {
  mediaType: string;
  sizeBytes: number;
  /** Absent when the check is not model-specific, e.g. inside the upload route. */
  modelAccepts?: (kind: AttachmentKind) => boolean;
}): AttachmentRejection | null {
  const kind = attachmentKindOf(candidate.mediaType);
  if (kind === null) {
    return {
      reason: "media-type",
      message: "Only PNG, JPEG, WebP and GIF images and PDF files can be attached.",
    };
  }

  const limit = MAX_ATTACHMENT_BYTES[kind];
  if (candidate.sizeBytes > limit) {
    return {
      reason: "too-large",
      message: `${kind === "pdf" ? "PDFs" : "Images"} must be ${formatBytes(limit)} or smaller.`,
    };
  }

  if (candidate.modelAccepts !== undefined && !candidate.modelAccepts(kind)) {
    return {
      reason: "model-unsupported",
      message: `The selected model can't read ${kind === "pdf" ? "PDFs" : "images"}. Choose another model to attach one.`,
    };
  }

  return null;
}

/** Decoded byte length of a base64 payload, without decoding it. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Where an attachment is read from.
 *
 * This app's own origin, always. The bytes live in Postgres and are served by
 * a route that checks ownership on every read, so there is no URL anywhere
 * that works without a session — which is the property a chat attachment
 * needs, given it may be an invoice or a medical document.
 */
export function attachmentUrl(attachmentId: string): string {
  return `/api/attachments/${encodeURIComponent(attachmentId)}`;
}
