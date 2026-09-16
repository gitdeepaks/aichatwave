/**
 * Reading an attachment.
 *
 * The bytes are in Postgres, so this route is the only way to reach them and
 * ownership is checked on every read. There is no URL anywhere — signed or
 * otherwise — that serves a file to someone without a session, which is the
 * property a chat attachment needs given it may be an invoice or a medical
 * document.
 *
 * `Cache-Control: private` lets the viewer's own browser reuse the bytes while
 * forbidding any shared cache from holding them, so a conversation with images
 * does not re-download them on every render, and no proxy ends up serving one
 * user's file to another.
 */

import { z } from "zod";
import { readAttachmentForUser } from "@/server/chat/attachment-service";
import { createRouteHandler, noBody, noQuery } from "@/server/lib/route-handler";

const paramsSchema = z.object({ attachmentId: z.string().min(1) });

export const GET = createRouteHandler({
  name: "GET /api/attachments/[attachmentId]",
  params: paramsSchema,
  query: noQuery,
  body: noBody,
  handler: async ({ userId, params, requestId }) => {
    const record = await readAttachmentForUser({ attachmentId: params.attachmentId, userId });

    return new Response(new Uint8Array(record.data), {
      status: 200,
      headers: {
        "content-type": record.mediaType,
        "content-length": String(record.sizeBytes),
        // `inline` so an image renders in the page; the filename is still
        // carried so a deliberate download keeps its name. Quoted and stripped
        // of quotes and control characters, because the filename is user input
        // and this is a header.
        "content-disposition": `inline; filename="${record.filename.replace(/["\\\r\n]/g, "")}"`,
        "cache-control": "private, max-age=3600",
        // The file is user-supplied and served from this origin. Without this a
        // crafted upload could be fetched as a script or styled into the page;
        // `nosniff` keeps the browser to the declared type, and the sandboxed
        // CSP makes the response inert if anything ever reaches it as a
        // document.
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-request-id": requestId,
      },
    });
  },
});
