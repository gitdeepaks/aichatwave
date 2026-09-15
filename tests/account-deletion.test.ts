import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_DELETION_CONFIRMATION, accountDeletionFormState } from "@/lib/account-deletion";

test("account deletion requires the exact confirmation phrase", () => {
  assert.equal(
    accountDeletionFormState({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      pending: false,
      error: null,
    }),
    "ready",
  );
  assert.equal(
    accountDeletionFormState({ confirmation: "delete my account", pending: false, error: null }),
    "idle",
  );
  assert.equal(
    accountDeletionFormState({
      confirmation: `${ACCOUNT_DELETION_CONFIRMATION} `,
      pending: false,
      error: null,
    }),
    "idle",
  );
});

test("pending and error states take precedence over confirmation readiness", () => {
  assert.equal(
    accountDeletionFormState({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      pending: true,
      error: null,
    }),
    "pending",
  );
  assert.equal(
    accountDeletionFormState({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      pending: false,
      error: "Try again",
    }),
    "error",
  );
});
