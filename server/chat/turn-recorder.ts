/**
 * Rebuilding the assistant's message from the stream the client received.
 *
 * Before Phase G, a turn was written from inside the graph: the user's message
 * before the model ran, the assistant's from the `llmCall` node, and tool
 * results from a third write that patched the row in place. Three transactions
 * for one turn, in an order nothing enforced, which is how a stopped
 * generation left a message row with a tool call that never resolved.
 *
 * The stream is the better source. It is what the user actually saw, it exists
 * for exactly as long as the turn does, and it settles exactly once — so
 * accumulating from it and writing at settle makes "what is in the database"
 * and "what is on screen" the same thing by construction, including when the
 * answer was cut short.
 *
 * This module is pure: it folds chunks into parts and never touches the
 * database. `turn-registry.ts` owns the lifetime, `turn-commit.ts` the write.
 */

import type { UIMessageChunk } from "ai";
import { jsonValueSchema } from "@/lib/json";
import type { MessageParts, ToolPart } from "@/lib/ai/message-parts";

/**
 * Accumulated state for one assistant turn.
 *
 * Text and reasoning are keyed by the id the stream gives them, because a
 * single turn can open several blocks — a tool loop produces one text block
 * per step — and they must be kept apart and then concatenated in the order
 * they were opened.
 */
export type TurnAccumulator = {
  /** Block id → text, in insertion order. */
  readonly text: Map<string, string>;
  readonly reasoning: Map<string, string>;
  /** Tool call id → part, resolved in place as the call progresses. */
  readonly tools: Map<string, ToolPart>;
  /** Order in which blocks were opened, so parts come out as they were shown. */
  readonly order: Array<{ kind: "text" | "reasoning" | "tool"; id: string }>;
  errorText: string | null;
};

export function createTurnAccumulator(): TurnAccumulator {
  return {
    text: new Map(),
    reasoning: new Map(),
    tools: new Map(),
    order: [],
    errorText: null,
  };
}

function remember(
  accumulator: TurnAccumulator,
  kind: "text" | "reasoning" | "tool",
  id: string,
): void {
  if (accumulator.order.some((entry) => entry.kind === kind && entry.id === id)) return;
  accumulator.order.push({ kind, id });
}

/**
 * Folds one chunk into the accumulator.
 *
 * The switch is deliberately not exhaustive over `UIMessageChunk`: that union
 * carries well over twenty members, most of which describe transport concerns
 * (step boundaries, approvals, source citations) that have no persisted
 * counterpart. Ignoring them is the correct behaviour, and a `default` that
 * does nothing says so more honestly than twenty empty cases would.
 */
export function recordChunk(accumulator: TurnAccumulator, chunk: UIMessageChunk): void {
  switch (chunk.type) {
    case "text-start": {
      remember(accumulator, "text", chunk.id);
      accumulator.text.set(chunk.id, accumulator.text.get(chunk.id) ?? "");
      return;
    }
    case "text-delta": {
      remember(accumulator, "text", chunk.id);
      accumulator.text.set(chunk.id, (accumulator.text.get(chunk.id) ?? "") + chunk.delta);
      return;
    }
    case "reasoning-start": {
      remember(accumulator, "reasoning", chunk.id);
      accumulator.reasoning.set(chunk.id, accumulator.reasoning.get(chunk.id) ?? "");
      return;
    }
    case "reasoning-delta": {
      remember(accumulator, "reasoning", chunk.id);
      accumulator.reasoning.set(
        chunk.id,
        (accumulator.reasoning.get(chunk.id) ?? "") + chunk.delta,
      );
      return;
    }
    case "tool-input-available": {
      remember(accumulator, "tool", chunk.toolCallId);
      accumulator.tools.set(chunk.toolCallId, {
        type: "tool",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: "input-available",
        input: jsonValueSchema.catch(null).parse(chunk.input),
        output: null,
        errorText: null,
      });
      return;
    }
    case "tool-input-error": {
      remember(accumulator, "tool", chunk.toolCallId);
      accumulator.tools.set(chunk.toolCallId, {
        type: "tool",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        state: "output-error",
        input: jsonValueSchema.catch(null).parse(chunk.input),
        output: null,
        errorText: chunk.errorText,
      });
      return;
    }
    case "tool-output-available": {
      const existing = accumulator.tools.get(chunk.toolCallId);
      if (!existing) return;
      accumulator.tools.set(chunk.toolCallId, {
        ...existing,
        state: "output-available",
        output: jsonValueSchema.catch(null).parse(chunk.output),
        errorText: null,
      });
      return;
    }
    case "tool-output-error": {
      const existing = accumulator.tools.get(chunk.toolCallId);
      if (!existing) return;
      accumulator.tools.set(chunk.toolCallId, {
        ...existing,
        state: "output-error",
        output: null,
        errorText: chunk.errorText,
      });
      return;
    }
    case "error": {
      accumulator.errorText = chunk.errorText;
      return;
    }
    default:
      return;
  }
}

/**
 * The assistant message's parts, in the order the user saw them.
 *
 * Empty text and reasoning blocks are dropped — a stream that opened a block
 * and was stopped before a token arrived should not persist an empty bubble —
 * but a tool call that never resolved is kept at `input-available`, because
 * "the model asked for this and we stopped it" is a true and useful thing for
 * the history to say.
 */
export function toMessageParts(accumulator: TurnAccumulator): MessageParts {
  const parts: MessageParts = [];

  for (const entry of accumulator.order) {
    if (entry.kind === "text") {
      const text = accumulator.text.get(entry.id) ?? "";
      if (text.length > 0) parts.push({ type: "text", text });
      continue;
    }
    if (entry.kind === "reasoning") {
      const text = accumulator.reasoning.get(entry.id) ?? "";
      if (text.length > 0) parts.push({ type: "reasoning", text });
      continue;
    }
    const tool = accumulator.tools.get(entry.id);
    if (tool) parts.push(tool);
  }

  return parts;
}

/** Plain text of the turn so far, for the title generator and for previews. */
export function accumulatedText(accumulator: TurnAccumulator): string {
  return [...accumulator.text.values()].join("\n").trim();
}
