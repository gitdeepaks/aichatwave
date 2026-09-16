/**
 * The exact shape an attachment must take to reach a model.
 *
 * Pure and dependency-free on purpose: this is the one detail of the
 * attachment path that a provider will reject at runtime and nothing will
 * catch earlier, so it has to be testable without a database or a configured
 * environment.
 *
 * ## Why `source_type`
 *
 * LangChain only translates a content block into a provider's own wire format
 * when its `isDataContentBlock` guard recognises it, and that guard tests for
 * a `source_type` field. A block written in the newer
 * `{ type, mimeType, data }` style fails the guard, is passed through
 * untouched, and is rejected by the provider — OpenAI answers
 * `400 Invalid value: 'image'. Supported values are: 'text', 'image_url', …`.
 *
 * So: `source_type`, and the snake_case `mime_type`, which
 * `fromStandardImageBlock` and `fromStandardFileBlock` read in all three
 * provider packages this app uses. `metadata.filename` is not decoration
 * either — OpenAI's Completions converter requires a filename on a file block.
 */

import type { AttachmentKind } from "@/lib/ai/attachments";

export type AttachmentContentBlock =
  | { type: "image"; source_type: "base64"; mime_type: string; data: string }
  | {
      type: "file";
      source_type: "base64";
      mime_type: string;
      data: string;
      metadata: { filename: string };
    };

/** Exhaustive over `AttachmentKind`, so a new kind needs a block shape to compile. */
export function buildAttachmentBlock(params: {
  kind: AttachmentKind;
  mediaType: string;
  data: string;
  filename: string;
}): AttachmentContentBlock {
  switch (params.kind) {
    case "image":
      return {
        type: "image",
        source_type: "base64",
        mime_type: params.mediaType,
        data: params.data,
      };
    case "pdf":
      return {
        type: "file",
        source_type: "base64",
        mime_type: params.mediaType,
        data: params.data,
        metadata: { filename: params.filename },
      };
  }
}
