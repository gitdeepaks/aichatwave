import assert from "node:assert/strict";
import test from "node:test";
import { isAdminUser, parseAdminUserIds } from "@/lib/security/admin-policy";

test("an unset allowlist admits nobody", () => {
  const ids = parseAdminUserIds(undefined);

  assert.equal(ids.size, 0);
  assert.equal(isAdminUser({ userId: "user_1", adminUserIds: ids }), false);
});

test("entries are trimmed and blanks dropped", () => {
  const ids = parseAdminUserIds(" user_1 , user_2,, \n user_3 ,");

  assert.deepEqual([...ids].sort(), ["user_1", "user_2", "user_3"]);
});

test("a trailing comma cannot create an empty id that matches an empty user", () => {
  const ids = parseAdminUserIds("user_1,");

  assert.equal(ids.has(""), false);
  assert.equal(isAdminUser({ userId: "", adminUserIds: ids }), false);
});

test("membership is exact — no prefix, no case folding", () => {
  const ids = parseAdminUserIds("user_abc");

  assert.equal(isAdminUser({ userId: "user_abc", adminUserIds: ids }), true);
  assert.equal(isAdminUser({ userId: "user_abcd", adminUserIds: ids }), false);
  assert.equal(isAdminUser({ userId: "USER_ABC", adminUserIds: ids }), false);
});
