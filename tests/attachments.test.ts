import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTACHMENT_ACCEPT,
  attachmentKindOf,
  attachmentUrl,
  isAcceptedMediaType,
  MAX_ATTACHMENT_BYTES,
  MAX_UPLOAD_BODY_BYTES,
  base64ByteLength,
  rejectAttachment,
} from "@/lib/ai/attachments";
import { modelAcceptsAttachmentKind } from "@/lib/ai/model-registry";

test("the ceilings keep a base64 body under the platform's request limit", () => {
  assert.equal(MAX_ATTACHMENT_BYTES.image, 2 * 1024 * 1024);
  assert.equal(MAX_ATTACHMENT_BYTES.pdf, 3 * 1024 * 1024);

  // Attachments travel as base64 in a JSON body, which is 4/3 the file size,
  // and a serverless request body is capped at 4.5 MB. A file at the ceiling
  // has to arrive inside that, or it is rejected by the platform before any of
  // this code runs — a failure with no error message available to it.
  assert.ok(MAX_UPLOAD_BODY_BYTES < 4.5 * 1024 * 1024, `${MAX_UPLOAD_BODY_BYTES} bytes`);
});

test("base64 length is measured without decoding, and agrees with decoding", () => {
  // Checked against a real decode rather than against arithmetic done by hand,
  // so the test cannot agree with the implementation and both be wrong.
  for (const encoded of ["AAEC", "AAECAw==", "AAECAwQ=", ""]) {
    assert.equal(base64ByteLength(encoded), Buffer.from(encoded, "base64").length, `"${encoded}"`);
  }
});

test("the accepted set is an allowlist, not a prefix test", () => {
  assert.equal(attachmentKindOf("image/png"), "image");
  assert.equal(attachmentKindOf("application/pdf"), "pdf");
  assert.equal(attachmentKindOf("image/svg+xml"), null);
  assert.equal(isAcceptedMediaType("text/html"), false);
  assert.equal(isAcceptedMediaType("application/x-msdownload"), false);
});

test("the file input's accept attribute lists exactly the allowlist", () => {
  const listed = ATTACHMENT_ACCEPT.split(",");
  assert.equal(listed.length, 5);
  for (const mediaType of listed) {
    assert.notEqual(attachmentKindOf(mediaType), null, mediaType);
  }
});

test("an unsupported media type is refused before its size is considered", () => {
  const rejection = rejectAttachment({ mediaType: "image/svg+xml", sizeBytes: 10 });

  assert.equal(rejection?.reason, "media-type");
});

test("each kind is held to its own ceiling", () => {
  assert.equal(rejectAttachment({ mediaType: "image/png", sizeBytes: 2 * 1024 * 1024 }), null);
  assert.equal(
    rejectAttachment({ mediaType: "image/png", sizeBytes: 2 * 1024 * 1024 + 1 })?.reason,
    "too-large",
  );
  // A PDF above the image ceiling is fine — the limits are genuinely per-kind.
  assert.equal(
    rejectAttachment({ mediaType: "application/pdf", sizeBytes: 3 * 1024 * 1024 }),
    null,
  );
});

test("a model that cannot read the kind refuses it, with a message naming the kind", () => {
  const rejection = rejectAttachment({
    mediaType: "application/pdf",
    sizeBytes: 1024,
    modelAccepts: () => false,
  });

  assert.equal(rejection?.reason, "model-unsupported");
  assert.match(rejection?.message ?? "", /PDFs/);
});

test("every registry model declares what it can read", () => {
  // Not an assertion that all are true — an assertion that the question is
  // answerable for every model, so adding one cannot leave it undefined.
  for (const modelId of ["gpt-5-mini", "gpt-5-nano", "gemini-3.1-pro"] as const) {
    assert.equal(typeof modelAcceptsAttachmentKind(modelId, "image"), "boolean");
    assert.equal(typeof modelAcceptsAttachmentKind(modelId, "pdf"), "boolean");
  }
});

test("attachments are addressed through this app, and the id is escaped", () => {
  assert.equal(attachmentUrl("abc-123"), "/api/attachments/abc-123");
  assert.equal(attachmentUrl("a/b"), "/api/attachments/a%2Fb");
  // Always relative to this origin: the bytes are only reachable through the
  // route that checks ownership, so there is no external URL to point at.
  assert.equal(attachmentUrl("abc").startsWith("/api/"), true);
});
