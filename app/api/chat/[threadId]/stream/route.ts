/**
 * The lifecycle of an answer that outlives its request.
 *
 * `GET` reconnects to one still being written. The AI SDK's
 * `HttpChatTransport.reconnectToStream` calls `GET {api}/{chatId}/stream` — with
 * `api` at `/api/chat` and each chat keyed by thread id, that is this route. It
 * answers with the same Server-Sent Events the original response was carrying,
 * replayed from `chat_stream_chunk` and then followed live until the turn
 * settles, or `204` when there is nothing to rejoin.
 *
 * `DELETE` stops one. Stop has to be an explicit request rather than a dropped
 * connection, because at the HTTP level a stop and a page refresh are the same
 * event — the browser cancels the fetch — and they call for opposite responses:
 * one should end the turn, the other should leave it running so the reload can
 * pick it up.
 */

import { z } from "zod";
import { abortChatStream, findResumableStream } from "@/server/db/chat-stream-repository";
import { replayStream } from "@/server/chat/stream-buffer";
import { abortTurnByStreamId } from "@/server/chat/turn-registry";
import { findThreadForUser, threadExists } from "@/server/db/thread-repository";
import { AppError } from "@/server/lib/app-error";
import { createRouteHandler, jsonResponse, noBody, noQuery } from "@/server/lib/route-handler";

const paramsSchema = z.object({ threadId: z.string().min(1) });

/**
 * Resolves the stream a request may act on, or null when there is none.
 *
 * A thread that does not exist yet answers "nothing to resume" rather than 404.
 * That is the ordinary case, not an edge case: the home page mints a thread id
 * for a conversation that has not been created, and `resume: true` asks about
 * it on every load. A 404 there would surface as a failed chat on a page where
 * nothing has happened. A thread that exists and belongs to someone else is
 * still a 403 — that one is a real answer, not a quiet one.
 */
async function resolveOwnedStream(params: { threadId: string; userId: string }) {
  const owned = await findThreadForUser(params);
  if (owned === null) {
    if (await threadExists(params.threadId)) {
      throw new AppError("FORBIDDEN", "You don't have access to this thread.");
    }
    return null;
  }

  return findResumableStream({ threadId: params.threadId, userId: params.userId, now: new Date() });
}

export const GET = createRouteHandler({
  name: "GET /api/chat/[threadId]/stream",
  params: paramsSchema,
  query: noQuery,
  body: noBody,
  handler: async ({ userId, params, requestId, log }) => {
    const stream = await resolveOwnedStream({ threadId: params.threadId, userId });

    if (stream === null) {
      return new Response(null, { status: 204, headers: { "x-request-id": requestId } });
    }

    log.info("chat.stream_resumed", { threadId: params.threadId, streamId: stream.id });

    return new Response(replayStream({ streamId: stream.id, log }), {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-vercel-ai-ui-message-stream": "v1",
        // Matches what `createUIMessageStreamResponse` sends on the live path:
        // without it nginx buffers the replay and the reconnect arrives as one
        // block at the end, which is the opposite of resuming.
        "x-accel-buffering": "no",
        "x-request-id": requestId,
        "x-stream-id": stream.id,
      },
    });
  },
});

export const DELETE = createRouteHandler({
  name: "DELETE /api/chat/[threadId]/stream",
  params: paramsSchema,
  query: noQuery,
  body: noBody,
  handler: async ({ userId, params, log }) => {
    const stream = await resolveOwnedStream({ threadId: params.threadId, userId });

    // Idempotent: stopping an answer that already finished is not an error, and
    // the client cannot know which it is — it presses stop as the last token
    // arrives just as often as mid-paragraph.
    if (stream === null) return jsonResponse({ stopped: false });

    // The flag first, so a stop is durable even when the answer is being
    // produced by another instance. That instance notices on its next buffer
    // flush; this one, if it is the one, stops immediately.
    const marked = await abortChatStream({ streamId: stream.id, at: new Date() });
    const abortedLocally = abortTurnByStreamId(stream.id);

    log.info("chat.stream_stopped", {
      threadId: params.threadId,
      streamId: stream.id,
      marked,
      abortedLocally,
    });

    return jsonResponse({ stopped: marked });
  },
});
