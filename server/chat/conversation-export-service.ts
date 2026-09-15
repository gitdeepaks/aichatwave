import type {
  ConversationExportMessage,
  ConversationExportThread,
} from "@/lib/conversation-export";
import {
  safeExportFilename,
  serializeJsonExportEnd,
  serializeJsonExportMessage,
  serializeJsonExportStart,
  serializeMarkdownExportMessage,
  serializeMarkdownExportStart,
} from "@/lib/conversation-export";
import { listMessagesForExport } from "@/server/db/message-repository";
import { requireOwnedThread } from "@/server/chat/thread-service";
import type { Logger } from "@/server/lib/logger";

const EXPORT_PAGE_SIZE = 100;

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export async function createConversationExport(params: {
  userId: string;
  threadId: string;
  format: "json" | "markdown";
  log: Logger;
}): Promise<Response> {
  // Ownership is established before the Response is created, while status can
  // still correctly be 403/404 rather than a truncated 200 stream.
  const owned = await requireOwnedThread({ threadId: params.threadId, userId: params.userId });
  const exportedAt = new Date().toISOString();
  const thread: ConversationExportThread = {
    id: owned.id,
    title: owned.title,
    createdAt: owned.createdAt.toISOString(),
    updatedAt: owned.updatedAt.toISOString(),
    lastMessageAt: iso(owned.lastMessageAt),
    archivedAt: iso(owned.archivedAt),
    pinnedAt: iso(owned.pinnedAt),
  };
  const stream = iteratorToStream(exportChunks({ ...params, exportedAt, thread }));

  const extension = params.format === "json" ? "json" : "md";
  return new Response(stream, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": `attachment; filename="${safeExportFilename(owned.title, extension)}"`,
      "content-type":
        params.format === "json"
          ? "application/json; charset=utf-8"
          : "text/markdown; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

async function* exportChunks(params: {
  threadId: string;
  format: "json" | "markdown";
  exportedAt: string;
  thread: ConversationExportThread;
  log: Logger;
}): AsyncGenerator<Uint8Array, void> {
  const encoder = new TextEncoder();
  let cursor = null;
  let first = true;

  try {
    const start =
      params.format === "json"
        ? serializeJsonExportStart({ exportedAt: params.exportedAt, thread: params.thread })
        : serializeMarkdownExportStart({ exportedAt: params.exportedAt, thread: params.thread });
    yield encoder.encode(start);

    do {
      const page = await listMessagesForExport({
        threadId: params.threadId,
        after: cursor,
        limit: EXPORT_PAGE_SIZE,
        log: params.log,
      });
      for (const record of page.items) {
        const message: ConversationExportMessage = {
          id: record.id,
          role: record.role,
          parts: record.parts,
          modelId: record.modelId,
          tokens: { input: record.inputTokens, output: record.outputTokens },
          createdAt: record.createdAt.toISOString(),
        };
        const serialized =
          params.format === "json"
            ? serializeJsonExportMessage(message, first)
            : serializeMarkdownExportMessage(message);
        yield encoder.encode(serialized);
        first = false;
      }
      cursor = page.next;
    } while (cursor !== null);

    if (params.format === "json") yield encoder.encode(serializeJsonExportEnd());
  } catch (error) {
    params.log.error("conversation.export_failed", { threadId: params.threadId }, error);
    throw error;
  }
}

function iteratorToStream(iterator: AsyncGenerator<Uint8Array, void>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return();
    },
  });
}
