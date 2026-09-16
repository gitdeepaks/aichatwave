/**
 * Uploading a message attachment.
 *
 * The file arrives as base64 inside a JSON body rather than as multipart. That
 * is a deliberate trade: it costs 33% in transfer size, and it buys this route
 * the same session check, same-origin check, typed error envelope and request
 * logging every other route in this app gets from `createRouteHandler` — none
 * of which would apply to a hand-rolled multipart handler.
 *
 * The 33% is also why the size ceilings are what they are; see
 * `MAX_ATTACHMENT_BYTES` for the platform limit they are sized against.
 */

import { z } from "zod";
import { base64ByteLength, isAcceptedMediaType, MAX_ATTACHMENT_BYTES } from "@/lib/ai/attachments";
import { attachmentDtoSchema, type AttachmentDto } from "@/lib/api/contracts";
import { storeAttachment } from "@/server/chat/attachment-service";
import { createRouteHandler, jsonResponse, noParams, noQuery } from "@/server/lib/route-handler";

const MAX_BASE64_LENGTH =
  Math.ceil((Math.max(...Object.values(MAX_ATTACHMENT_BYTES)) * 4) / 3) + 16;

const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  /**
   * Checked before decoding, not after. Decoding first would mean allocating
   * whatever was sent in order to discover it was too large, which is the
   * shape of a trivial memory-exhaustion request.
   */
  mediaType: z.string().refine(isAcceptedMediaType, {
    message: "Only PNG, JPEG, WebP and GIF images and PDF files can be attached.",
  }),
  data: z
    .string()
    .min(1)
    .max(MAX_BASE64_LENGTH, { message: "That file is too large to attach." })
    .refine((value) => /^[A-Za-z0-9+/]*={0,2}$/.test(value), {
      message: "Attachment data must be base64.",
    }),
});

export const POST = createRouteHandler({
  name: "POST /api/attachments",
  params: noParams,
  query: noQuery,
  body: uploadRequestSchema,
  handler: async ({ userId, body, log }) => {
    const record = await storeAttachment({
      userId,
      filename: body.filename,
      mediaType: body.mediaType,
      // `base64ByteLength` gave the schema a cheap bound; this is the real
      // decode, and `storeAttachment` re-checks the decoded size against the
      // per-kind ceiling before anything is written.
      data: Buffer.from(body.data, "base64"),
      log,
    });

    const dto: AttachmentDto = attachmentDtoSchema.parse({
      id: record.id,
      filename: record.filename,
      mediaType: record.mediaType,
      sizeBytes: record.sizeBytes,
    });

    return jsonResponse({ attachment: dto }, 201);
  },
});

export { base64ByteLength };
