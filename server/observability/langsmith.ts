/**
 * LangSmith tracing for the agent graph.
 *
 * There is no SDK to wire up: LangChain reads `LANGSMITH_TRACING` and
 * `LANGSMITH_API_KEY` from the environment itself and traces every runnable it
 * executes. What it does *not* do on its own is tell you whose turn a run was,
 * which request it belongs to, or which thread it is part of — so a LangSmith
 * project fills with runs that show the prompt and the answer and cannot be
 * connected to anything else in the system.
 *
 * This module supplies that connective tissue: the same ids the logger and the
 * OpenTelemetry spans carry, attached to the run as metadata and tags, so an
 * incident that starts with a request id can be followed all the way into the
 * prompt that produced the bad answer.
 *
 * Note what is deliberately absent: the message content is *already* sent to
 * LangSmith by LangChain when tracing is on — that is the entire point of it
 * during an incident — so turning it on is a decision about where user
 * conversations may be stored, not a free win. `lib/env.ts` makes it explicit
 * and off by default.
 */

import { env, langsmithEnabled } from "@/lib/env";

/** Metadata and tags LangChain understands, for one graph run. */
export type LangsmithRunConfig = {
  readonly runName: string;
  readonly tags: string[];
  readonly metadata: Record<string, string>;
};

export function langsmithRunConfig(params: {
  readonly requestId: string;
  readonly userId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly modelId: string;
  readonly planId: string;
}): LangsmithRunConfig {
  return {
    runName: "chat-turn",
    // Tags are what LangSmith filters on cheaply. Kept to the two dimensions
    // an incident is actually sliced by: which model, and which plan.
    tags: [`model:${params.modelId}`, `plan:${params.planId}`],
    metadata: {
      request_id: params.requestId,
      user_id: params.userId,
      thread_id: params.threadId,
      turn_id: params.turnId,
      model_id: params.modelId,
    },
  };
}

export type LangsmithStatus = {
  readonly enabled: boolean;
  readonly project: string | null;
  readonly endpoint: string | null;
};

/** Reported at boot so "is tracing on?" is answered by a log line rather than a guess. */
export function langsmithStatus(): LangsmithStatus {
  return {
    enabled: langsmithEnabled,
    project: env.LANGSMITH_PROJECT ?? null,
    endpoint: env.LANGSMITH_ENDPOINT ?? null,
  };
}
