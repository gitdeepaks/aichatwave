import { agent } from "@/app/api/chat/graph";
import { db } from "@/db";
import { thread } from "@/db/schema/chat-schema";
import { auth, polarClient } from "@/lib/auth";
import { HumanMessage } from "@langchain/core/messages";
import { createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { MODEL_REGISTRY } from "@/app/api/chat/model";
import { chatRequestSchema, formatChatValidationError } from "@/app/api/chat/schema";

export const POST = async (req: Request) => {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return Response.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const parsedBody = chatRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(formatChatValidationError(parsedBody.error), { status: 400 });
  }

  const { threadId, messageContent, selectedModel } = parsedBody.data;

  const authData = await auth.api.getSession({
    headers: await headers(),
  });

  if (!authData?.user.id) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "You don't have access to this thread." } },
      { status: 403 },
    );
  }

  //todo: check if thread exists
  const threadsFromDb = await db.select().from(thread).where(eq(thread.id, threadId)).limit(1);

  const existingThread = threadsFromDb[0]; //undefined
  if (!existingThread) {
    const title = messageContent.trim().slice(0, 30) || "New Chat";

    await db.insert(thread).values({
      id: threadId,
      title: title,
      userId: authData?.user.id,
    });
  }
  if (existingThread && existingThread?.userId !== authData?.user.id) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "You don't have access to this thread." } },
      { status: 403 },
    );
  }

  const modelConfig = MODEL_REGISTRY[selectedModel];

  let hasAccess = modelConfig?.tier === "free";

  if (modelConfig?.tier === "subscription") {
    try {
      const data = await polarClient.subscriptions.list({
        externalCustomerId: authData.user.id,
        active: true,
      });
      hasAccess = data.result.items.length > 0;
    } catch (error) {
      console.error("Error checking subscription", error);
      hasAccess = false;
    }
  }

  if (!hasAccess) {
    return Response.json(
      {
        error: {
          code: "MODEL_ACCESS_DENIED",
          message: "You don't have access to this model. Please upgrade to a Pro subscription.",
        },
      },
      { status: 403 },
    );
  }

  const stream = await agent.streamEvents(
    { messages: [new HumanMessage(messageContent)] },
    {
      configurable: {
        thread_id: threadId,
      },
      version: "v2",
      context: {
        userId: authData.user.id,
        selectedModel,
      },
    },
  );

  const streamResponse = createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
  });

  return streamResponse;
};
