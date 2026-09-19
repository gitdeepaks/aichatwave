import assert from "node:assert/strict";
import test from "node:test";

import { chatAnnouncement } from "@/components/chat/utils/chat-announcement";
import type { AppUIMessage } from "@/lib/chat/ui-message";

function assistant(id: string, text: string): AppUIMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

function user(id: string, text: string): AppUIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

test("submitting announces once, streaming announces nothing", () => {
  assert.deepEqual(chatAnnouncement({ status: { kind: "submitted", label: "" }, messages: [] }), {
    key: "submitted",
    message: "Generating a response.",
  });

  assert.equal(
    chatAnnouncement({ status: { kind: "streaming", label: "" }, messages: [] }),
    null,
    "streaming must stay silent — announcing tokens is what made the old live region unusable",
  );
});

test("a running tool is announced under its own key", () => {
  const announcement = chatAnnouncement({
    status: { kind: "tool-running", label: "Fetching weather...", toolName: "display_weather" },
    messages: [],
  });

  assert.deepEqual(announcement, {
    key: "tool:display_weather",
    message: "Fetching weather...",
  });
});

test("a finished answer reports its length rather than its content", () => {
  const announcement = chatAnnouncement({
    status: { kind: "idle" },
    messages: [user("u1", "hi"), assistant("a1", "one two three four five")],
  });

  assert.deepEqual(announcement, { key: "done:a1", message: "Response complete. 5 words." });
});

test("a one-word answer is singular", () => {
  const announcement = chatAnnouncement({
    status: { kind: "idle" },
    messages: [assistant("a1", "Yes")],
  });

  assert.deepEqual(announcement, { key: "done:a1", message: "Response complete. 1 word." });
});

test("an answer with no prose says so without quoting a zero", () => {
  const announcement = chatAnnouncement({
    status: { kind: "idle" },
    messages: [{ id: "a1", role: "assistant", parts: [] }],
  });

  assert.deepEqual(announcement, { key: "done:a1", message: "Response complete." });
});

test("an idle conversation whose last turn is the user's announces nothing", () => {
  assert.equal(
    chatAnnouncement({ status: { kind: "idle" }, messages: [user("u1", "hello")] }),
    null,
  );
  assert.equal(chatAnnouncement({ status: { kind: "idle" }, messages: [] }), null);
});

test("failures are announced and keyed on their message, so a new one is heard", () => {
  const rateLimited = chatAnnouncement({
    status: {
      kind: "rate-limited",
      label: "Too many requests (30s)",
      retryLabel: "Try again",
      retryAfterSeconds: 30,
    },
    messages: [],
  });
  assert.deepEqual(rateLimited, {
    key: "error:Too many requests (30s)",
    message: "Too many requests (30s)",
  });

  const quota = chatAnnouncement({
    status: { kind: "quota-exceeded", label: "Monthly allowance spent", upgradeLabel: "Upgrade" },
    messages: [],
  });
  assert.deepEqual(quota, {
    key: "error:Monthly allowance spent",
    message: "Monthly allowance spent",
  });

  assert.notEqual(rateLimited?.key, quota?.key);
});

test("stopping and uploading each get one utterance", () => {
  assert.deepEqual(chatAnnouncement({ status: { kind: "stopped", label: "" }, messages: [] }), {
    key: "stopped",
    message: "Generation stopped.",
  });

  assert.deepEqual(
    chatAnnouncement({ status: { kind: "uploading", label: "Uploading 2 files" }, messages: [] }),
    { key: "uploading", message: "Uploading 2 files" },
  );
});

test("the completion key changes with the message, so two answers are both heard", () => {
  const first = chatAnnouncement({
    status: { kind: "idle" },
    messages: [assistant("a1", "first answer")],
  });
  const second = chatAnnouncement({
    status: { kind: "idle" },
    messages: [assistant("a1", "first answer"), assistant("a2", "second answer")],
  });

  assert.notEqual(first?.key, second?.key);
});
