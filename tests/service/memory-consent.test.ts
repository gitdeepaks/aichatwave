/**
 * Long-term memory consent, against a real `user` table.
 *
 * The property under test is the one the feature exists for: `undecided` is
 * not `granted`. A boolean column would have made that untestable, because
 * there would have been nothing to distinguish "never asked" from "said no" —
 * and the whole point is that the product previously behaved as though the
 * first meant yes.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dbTest, setupTestDatabase, withTestClient } from "../helpers/database";
import { seedUser } from "../helpers/seed";

setupTestDatabase();

const consentService = () => import("@/server/memory/memory-consent-service");

dbTest("a freshly provisioned user is undecided, not granted", async () => {
  const user = await seedUser({});
  const { readMemoryConsent, memoryIsPermitted } = await consentService();

  const consent = await readMemoryConsent(user.id);

  assert.deepEqual(consent, { state: "undecided", decidedAt: null });
  assert.equal(
    memoryIsPermitted(consent),
    false,
    "an unasked user must not have memories written about them",
  );
});

dbTest("a user with no row at all reads as undecided rather than throwing", async () => {
  const { readMemoryConsent } = await consentService();

  // The sign-up race: a session exists, the just-in-time `user` row does not
  // yet. "We have not asked" is the correct answer, and a throw here would
  // take the chat request down with it.
  const consent = await readMemoryConsent(`user_${randomUUID().replaceAll("-", "").slice(0, 20)}`);

  assert.deepEqual(consent, { state: "undecided", decidedAt: null });
});

dbTest("granting is recorded with a timestamp and permits memory", async () => {
  const user = await seedUser({});
  const { setMemoryConsent, readMemoryConsent, memoryIsPermitted } = await consentService();

  const before = new Date();
  const written = await setMemoryConsent({ userId: user.id, decision: "granted" });

  assert.equal(written.state, "granted");
  assert.ok(written.decidedAt !== null);
  assert.ok(written.decidedAt.getTime() >= before.getTime() - 1000);

  const read = await readMemoryConsent(user.id);
  assert.equal(read.state, "granted");
  assert.equal(memoryIsPermitted(read), true);
});

dbTest("declining is a decision, and it is not permission", async () => {
  const user = await seedUser({});
  const { setMemoryConsent, readMemoryConsent, memoryIsPermitted } = await consentService();

  await setMemoryConsent({ userId: user.id, decision: "declined" });
  const consent = await readMemoryConsent(user.id);

  assert.equal(consent.state, "declined");
  assert.ok(consent.decidedAt !== null, "a decline is a decision and is timestamped");
  assert.equal(memoryIsPermitted(consent), false);
});

dbTest("consent is reversible in both directions", async () => {
  const user = await seedUser({});
  const { setMemoryConsent, memoryIsPermitted } = await consentService();

  assert.equal(
    memoryIsPermitted(await setMemoryConsent({ userId: user.id, decision: "granted" })),
    true,
  );
  assert.equal(
    memoryIsPermitted(await setMemoryConsent({ userId: user.id, decision: "declined" })),
    false,
  );
  assert.equal(
    memoryIsPermitted(await setMemoryConsent({ userId: user.id, decision: "granted" })),
    true,
  );
});

dbTest("re-granting moves the timestamp, which is the audit trail", async () => {
  const user = await seedUser({});
  const { setMemoryConsent } = await consentService();

  const first = await setMemoryConsent({ userId: user.id, decision: "granted" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await setMemoryConsent({ userId: user.id, decision: "granted" });

  assert.ok(first.decidedAt !== null && second.decidedAt !== null);
  assert.ok(second.decidedAt.getTime() > first.decidedAt.getTime());
});

dbTest("a decision for a user that does not exist reports undecided, not success", async () => {
  const { setMemoryConsent } = await consentService();

  const result = await setMemoryConsent({
    userId: `user_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    decision: "granted",
  });

  // The update matched no row. Reporting "granted" here would tell the UI a
  // preference was saved that the database never kept.
  assert.deepEqual(result, { state: "undecided", decidedAt: null });
});

dbTest("the decision is stored in the column the migration declares", async () => {
  const user = await seedUser({});
  const { setMemoryConsent } = await consentService();

  await setMemoryConsent({ userId: user.id, decision: "declined" });

  const rows = await withTestClient((client) =>
    client.query<{ memory_consent: string | null; memory_consent_at: Date | null }>(
      'select memory_consent, memory_consent_at from "user" where id = $1',
      [user.id],
    ),
  );

  assert.equal(rows.rows[0]?.memory_consent, "declined");
  assert.notEqual(rows.rows[0]?.memory_consent_at, null);
});
