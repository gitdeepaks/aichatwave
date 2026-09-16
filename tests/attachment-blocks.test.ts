import assert from "node:assert/strict";
import test from "node:test";
import { isDataContentBlock } from "@langchain/core/messages";
import { buildAttachmentBlock } from "@/lib/ai/attachment-blocks";

/**
 * The guard LangChain itself applies before translating a block into a
 * provider's wire format. Asserting against the real function — rather than
 * against a copy of the shape — is the point: when it did not hold, the block
 * was passed through untranslated and OpenAI answered
 * `400 Invalid value: 'image'`, which nothing caught until a live request.
 */
test("both block kinds are recognised by LangChain as data content blocks", () => {
  for (const kind of ["image", "pdf"] as const) {
    const block = buildAttachmentBlock({
      kind,
      mediaType: kind === "pdf" ? "application/pdf" : "image/png",
      data: "AAEC",
      filename: "file.bin",
    });

    assert.equal(isDataContentBlock(block), true, kind);
  }
});

test("an image block carries base64 under the snake_case keys providers read", () => {
  const block = buildAttachmentBlock({
    kind: "image",
    mediaType: "image/png",
    data: "AAEC",
    filename: "chart.png",
  });

  assert.deepEqual(block, {
    type: "image",
    source_type: "base64",
    mime_type: "image/png",
    data: "AAEC",
  });
});

test("a PDF block is a file block and names the file, which OpenAI requires", () => {
  const block = buildAttachmentBlock({
    kind: "pdf",
    mediaType: "application/pdf",
    data: "AAEC",
    filename: "invoice.pdf",
  });

  assert.deepEqual(block, {
    type: "file",
    source_type: "base64",
    mime_type: "application/pdf",
    data: "AAEC",
    metadata: { filename: "invoice.pdf" },
  });
});

/**
 * Anthropic's file converter accepts a base64 document only when its media
 * type is `application/pdf` or a known image type, so a PDF must arrive with
 * its real media type rather than a generic one.
 */
test("the media type is carried through, not defaulted", () => {
  const block = buildAttachmentBlock({
    kind: "image",
    mediaType: "image/webp",
    data: "AAEC",
    filename: "shot.webp",
  });

  assert.equal(block.mime_type, "image/webp");
});
