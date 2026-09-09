/**
 * Keyset (cursor) pagination shared by every list endpoint.
 *
 * Offset pagination drifts when rows are inserted mid-scroll and degrades on
 * deep pages; a keyset cursor is stable and uses the same index the ORDER BY
 * uses. Cursors are opaque to the client and validated on the way back in, so a
 * tampered cursor is a 400 rather than a query error.
 */

import { z } from "zod";
import { AppError } from "@/server/lib/app-error";

export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

export const pageSizeSchema = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE);

/** A cursor points at the last row of the previous page. */
const cursorPayloadSchema = z.object({
  /** Sort key of the last row, as an ISO timestamp. */
  t: z.iso.datetime({ offset: true }),
  /** Row id, used as the tiebreaker for rows sharing a timestamp. */
  i: z.string().min(1),
});

export type Cursor = {
  sortValue: Date;
  id: string;
};

export function encodeCursor(cursor: Cursor): string {
  const payload = { t: cursor.sortValue.toISOString(), i: cursor.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");

  const json = z
    .string()
    .transform((value, context) => {
      try {
        return cursorPayloadSchema.parse(JSON.parse(value));
      } catch {
        context.addIssue({ code: "custom", message: "Cursor is not valid." });
        return z.NEVER;
      }
    })
    .safeParse(decoded);

  if (!json.success) {
    throw new AppError("INVALID_CURSOR", "That pagination cursor is not valid.");
  }

  return { sortValue: new Date(json.data.t), id: json.data.i };
}

export type Page<TItem> = {
  items: TItem[];
  nextCursor: string | null;
};

/**
 * Turns an over-fetched row set (limit + 1) into a page plus the cursor for the
 * next one. Fetching one extra row is how we know whether more exist without a
 * second COUNT query.
 */
export function toPage<TItem>(
  rows: TItem[],
  limit: number,
  toCursor: (item: TItem) => Cursor,
): Page<TItem> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  if (!last) {
    return { items, nextCursor: null };
  }

  return { items, nextCursor: encodeCursor(toCursor(last)) };
}
