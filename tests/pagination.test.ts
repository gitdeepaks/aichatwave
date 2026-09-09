import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "@/server/lib/app-error";
import { decodeCursor, encodeCursor, toPage } from "@/server/db/pagination";

test("cursors round-trip a sort value and id", () => {
  const cursor = { sortValue: new Date("2026-01-02T03:04:05.000Z"), id: "thread-1" };
  const decoded = decodeCursor(encodeCursor(cursor));

  assert.equal(decoded.sortValue.toISOString(), cursor.sortValue.toISOString());
  assert.equal(decoded.id, cursor.id);
});

test("rejects a tampered cursor with a typed 400", () => {
  const attempt = () => decodeCursor("not-a-real-cursor");

  assert.throws(attempt, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "INVALID_CURSOR");
    assert.equal(error.status, 400);
    return true;
  });
});

test("rejects a well-formed cursor carrying the wrong shape", () => {
  const forged = Buffer.from(JSON.stringify({ t: "yesterday", i: "" }), "utf8").toString(
    "base64url",
  );

  assert.throws(() => decodeCursor(forged), AppError);
});

type Row = { id: string; createdAt: Date };

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    createdAt: new Date(2026, 0, index + 1),
  }));

test("a full-but-not-overflowing page has no next cursor", () => {
  const page = toPage(rows(3), 3, (row) => ({ sortValue: row.createdAt, id: row.id }));

  assert.equal(page.items.length, 3);
  assert.equal(page.nextCursor, null);
});

test("an over-fetched row set is trimmed and yields a cursor at the last kept row", () => {
  const page = toPage(rows(4), 3, (row) => ({ sortValue: row.createdAt, id: row.id }));

  assert.equal(page.items.length, 3);
  assert.ok(page.nextCursor);
  assert.equal(decodeCursor(page.nextCursor).id, "row-2");
});

test("an empty result set is a valid terminal page", () => {
  const page = toPage([], 10, (row: Row) => ({ sortValue: row.createdAt, id: row.id }));

  assert.deepEqual(page, { items: [], nextCursor: null });
});
