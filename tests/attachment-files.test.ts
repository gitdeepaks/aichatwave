import assert from "node:assert/strict";
import test from "node:test";
import {
  AttachmentReadError,
  decodeBase64,
  parseDataUrl,
  toFile,
  toFiles,
} from "@/lib/chat/attachment-files";

test("a base64 data URL splits into its media type and payload", () => {
  assert.deepEqual(parseDataUrl("data:image/png;base64,AAEC"), {
    mediaType: "image/png",
    base64: "AAEC",
  });
});

test("a blob URL is not a data URL, and is not mistaken for one", () => {
  assert.equal(parseDataUrl("blob:http://localhost:3000/abc-123"), null);
  assert.equal(parseDataUrl("https://example.com/a.png"), null);
  // Not base64-encoded, so it carries no payload this decoder can read.
  assert.equal(parseDataUrl("data:text/plain,hello"), null);
});

test("base64 decodes to the exact bytes, including a zero byte", () => {
  const bytes = new Uint8Array(decodeBase64("AAEC"));
  assert.deepEqual([...bytes], [0, 1, 2]);
});

test("a data URL becomes a File with its name and declared type", async () => {
  const file = await toFile({
    url: "data:image/png;base64,AAEC",
    filename: "chart.png",
    mediaType: "image/png",
  });

  assert.equal(file.name, "chart.png");
  assert.equal(file.type, "image/png");
  assert.equal(file.size, 3);
});

test("a file with no name still becomes a File rather than failing", async () => {
  const file = await toFile({ url: "data:image/png;base64,AAEC", mediaType: "image/png" });
  assert.equal(file.name, "attachment");
});

/**
 * The defect this module exists for: a URL the browser will not hand back —
 * a `blob:` fetch refused by `connect-src`, say — used to yield *no file*, and
 * the message was sent without the attachment the user had watched appear in
 * the composer. Answering confidently about a document the model never saw is
 * the worst available outcome, because it looks like it worked.
 */
test("an unreadable attachment throws, naming the file, rather than vanishing", async () => {
  await assert.rejects(
    () =>
      toFile({
        url: "blob:http://localhost:3000/gone",
        filename: "invoice.pdf",
        mediaType: "application/pdf",
      }),
    (error: unknown) => {
      assert.ok(error instanceof AttachmentReadError);
      assert.equal(error.filename, "invoice.pdf");
      assert.match(error.message, /invoice\.pdf/);
      return true;
    },
  );
});

test("one unreadable file fails the whole batch — never a shorter list", async () => {
  await assert.rejects(() =>
    toFiles([
      { url: "data:image/png;base64,AAEC", filename: "ok.png", mediaType: "image/png" },
      { url: "blob:http://localhost:3000/gone", filename: "bad.png", mediaType: "image/png" },
    ]),
  );
});

test("an empty list is an empty list, not an error", async () => {
  assert.deepEqual(await toFiles([]), []);
});

test("order is preserved, because it is the order shown and sent to the model", async () => {
  const files = await toFiles([
    { url: "data:image/png;base64,AAEC", filename: "first.png", mediaType: "image/png" },
    {
      url: "data:application/pdf;base64,AAEC",
      filename: "second.pdf",
      mediaType: "application/pdf",
    },
  ]);

  assert.deepEqual(
    files.map((file) => file.name),
    ["first.png", "second.pdf"],
  );
});
