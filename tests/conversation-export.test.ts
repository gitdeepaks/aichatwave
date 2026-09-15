import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationExportSchema,
  safeExportFilename,
  serializeJsonExportEnd,
  serializeJsonExportMessage,
  serializeJsonExportStart,
  serializeMarkdownExportMessage,
  serializeMarkdownExportStart,
  type ConversationExportMessage,
  type ConversationExportThread,
} from "@/lib/conversation-export";

const thread: ConversationExportThread = {
  id: "thread-1",
  title: "Research / notes",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:02:00.000Z",
  lastMessageAt: "2026-09-15T10:02:00.000Z",
  archivedAt: null,
  pinnedAt: "2026-09-15T10:01:00.000Z",
};

const message: ConversationExportMessage = {
  id: "message-1",
  role: "assistant",
  modelId: "gpt-5-nano",
  tokens: { input: 12, output: 34 },
  createdAt: "2026-09-15T10:02:00.000Z",
  parts: [
    { type: "reasoning", text: "private reasoning record" },
    {
      type: "tool",
      toolCallId: "call-1",
      toolName: "search",
      state: "output-error",
      input: { query: "examples" },
      output: { partial: true },
      errorText: "provider failed",
    },
  ],
};

test("JSON export chunks form the versioned schema without losing rich parts", () => {
  const exportedAt = "2026-09-15T11:00:00.000Z";
  const serialized = [
    serializeJsonExportStart({ exportedAt, thread }),
    serializeJsonExportMessage(message, true),
    serializeJsonExportEnd(),
  ].join("");

  const parsed = conversationExportSchema.parse(JSON.parse(serialized));
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(parsed.messages[0], message);
});

test("Markdown export includes metadata, model, token counts, and exact parts JSON", () => {
  const markdown =
    serializeMarkdownExportStart({ exportedAt: "2026-09-15T11:00:00.000Z", thread }) +
    serializeMarkdownExportMessage(message);

  assert.match(markdown, /Thread ID: thread-1/);
  assert.match(markdown, /Model: gpt-5-nano/);
  assert.match(markdown, /Input tokens: 12/);
  assert.match(markdown, /"state": "output-error"/);
  assert.match(markdown, /"errorText": "provider failed"/);
  assert.match(markdown, /"type": "reasoning"/);
});

test("Markdown uses a fence longer than backticks contained in message data", () => {
  const markdown = serializeMarkdownExportMessage({
    ...message,
    parts: [{ type: "text", text: "embedded ``` and ```` fences" }],
  });

  assert.match(markdown, /`````json/);
  assert.match(markdown, /embedded ``` and ```` fences/);
});

test("export filenames are bounded ASCII and cannot inject headers", () => {
  const filename = safeExportFilename(
    "  Quarterly\r\nContent-Disposition: inline / résumé  ",
    "json",
  );
  assert.equal(filename, "Quarterly-Content-Disposition-inline-resume.json");
  assert.equal(filename.length <= 85, true);
});
