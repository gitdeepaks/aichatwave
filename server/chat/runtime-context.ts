/**
 * The values every graph node needs about the turn it is running.
 *
 * All fields are required. The graph used to receive
 * `context?: Partial<ChatRuntimeContext>` and each node defended with its own
 * guard, which meant `userId` could legitimately be undefined deep inside the
 * graph — memory writes silently no-opped and usage was ingested without a
 * customer. Parsing once at each node's edge makes that state unrepresentable.
 */

import { z } from "zod";
import { MODEL_IDS } from "@/lib/ai/model-registry";

export const chatRuntimeContextSchema = z.object({
  userId: z.string().min(1),
  threadId: z.string().min(1),
  requestId: z.string().min(1),
  selectedModel: z.enum(MODEL_IDS),
});

export type ChatRuntimeContext = z.infer<typeof chatRuntimeContextSchema>;
