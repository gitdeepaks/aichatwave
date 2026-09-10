/**
 * The values every graph node needs about the turn it is running.
 *
 * All fields are required, and the three ids are branded. The graph used to
 * receive `context?: Partial<ChatRuntimeContext>` and each node defended with
 * its own guard, which meant `userId` could legitimately be undefined deep
 * inside the graph — memory writes silently no-opped and usage was ingested
 * without a customer. Parsing once on entry makes that state unrepresentable.
 *
 * The brands exist because all three ids are strings and every one of them is
 * passed to functions taking `string`: `ingestModelUsage(userId, …)` accepted
 * a thread id just as happily. A branded id can only be produced by parsing,
 * so a swapped pair is a compile error rather than a billing bug.
 */

import { z } from "zod";
import { MODEL_IDS } from "@/lib/ai/model-registry";

export const userIdSchema = z.string().min(1).brand<"UserId">();
export type UserId = z.infer<typeof userIdSchema>;

export const threadIdSchema = z.string().min(1).brand<"ThreadId">();
export type ThreadId = z.infer<typeof threadIdSchema>;

export const requestIdSchema = z.string().min(1).brand<"RequestId">();
export type RequestId = z.infer<typeof requestIdSchema>;

export const chatRuntimeContextSchema = z.object({
  userId: userIdSchema,
  threadId: threadIdSchema,
  requestId: requestIdSchema,
  selectedModel: z.enum(MODEL_IDS),
});

export type ChatRuntimeContext = z.infer<typeof chatRuntimeContextSchema>;

/**
 * Parses a turn's raw ids into a runtime context. The only way to build one:
 * every id is validated here, at the request edge, and nothing downstream
 * needs to ask whether a field is present.
 */
export function toChatRuntimeContext(params: {
  userId: string;
  threadId: string;
  requestId: string;
  selectedModel: string;
}): ChatRuntimeContext {
  return chatRuntimeContextSchema.parse(params);
}
