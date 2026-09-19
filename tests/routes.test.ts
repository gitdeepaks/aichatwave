import assert from "node:assert/strict";
import test from "node:test";
import {
  absoluteUrl,
  chatRoute,
  DISALLOWED_CRAWL_PREFIXES,
  isChatRoute,
  PUBLIC_ROUTES,
  ROUTES,
  WORKSPACE_PREFIX,
} from "@/lib/routes";

test("every workspace route sits under the workspace prefix", () => {
  const workspaceRoutes = [
    ROUTES.app,
    ROUTES.memories,
    ROUTES.profile,
    ROUTES.checkoutSuccess,
    ROUTES.adminOperations,
  ];
  for (const route of workspaceRoutes) {
    assert.equal(route.startsWith(WORKSPACE_PREFIX), true, `${route} escaped the prefix`);
  }
});

test("no public route is under the workspace prefix", () => {
  for (const route of PUBLIC_ROUTES) {
    assert.equal(
      route.path.startsWith(WORKSPACE_PREFIX),
      false,
      `${route.path} is both indexed and authenticated`,
    );
  }
});

/**
 * The gate that matters: a route added to the workspace must be disallowed by
 * `robots.txt`. `robots.ts` derives its list from this constant, so the check
 * is that the constant actually covers the workspace.
 */
test("the crawl disallow list covers every workspace route", () => {
  const workspaceRoutes = [
    ROUTES.app,
    ROUTES.memories,
    ROUTES.profile,
    ROUTES.checkoutSuccess,
    ROUTES.adminOperations,
    chatRoute("6f1c2f1e-0b5f-4a1d-9a4e-1a2b3c4d5e6f"),
  ];

  for (const route of workspaceRoutes) {
    const covered = DISALLOWED_CRAWL_PREFIXES.some((prefix) => route.startsWith(prefix));
    assert.equal(covered, true, `${route} is crawlable`);
  }
});

test("auth screens are disallowed but not sitemapped", () => {
  // Widened to `string` on purpose. `PUBLIC_ROUTES[].path` and the auth routes
  // are disjoint literal types, so comparing them directly is a compile error —
  // which is a stronger guarantee than this assertion and the reason it is
  // phrased this way rather than deleted. The runtime check survives a future
  // widening of either type.
  const sitemapped: readonly string[] = PUBLIC_ROUTES.map((entry) => entry.path);

  for (const route of [ROUTES.signIn, ROUTES.signUp]) {
    assert.equal(
      DISALLOWED_CRAWL_PREFIXES.some((prefix) => route.startsWith(prefix)),
      true,
      `${route} is crawlable`,
    );
    assert.equal(sitemapped.includes(route), false, `${route} is in the sitemap`);
  }
});

test("chatRoute encodes the thread id", () => {
  assert.equal(chatRoute("abc"), "/app/chat/abc");
  // A slash in an id would otherwise mint a URL that resolves to a different
  // route entirely.
  assert.equal(chatRoute("a/b"), "/app/chat/a%2Fb");
  assert.equal(chatRoute("a b"), "/app/chat/a%20b");
});

test("isChatRoute matches only that thread's own URL", () => {
  assert.equal(isChatRoute("/app/chat/abc", "abc"), true);
  assert.equal(isChatRoute("/app/chat/abcd", "abc"), false);
  assert.equal(isChatRoute("/app", "abc"), false);
  // Consistent with the encoding above, so a deleted thread with an awkward id
  // still navigates away.
  assert.equal(isChatRoute("/app/chat/a%2Fb", "a/b"), true);
});

test("absoluteUrl joins an origin and a path without doubling the slash", () => {
  assert.equal(absoluteUrl("https://example.com", "/pricing"), "https://example.com/pricing");
  assert.equal(absoluteUrl("https://example.com/", "/pricing"), "https://example.com/pricing");
  assert.equal(absoluteUrl("https://example.com", "/"), "https://example.com/");
});

test("sitemap priorities are valid and the home page ranks highest", () => {
  const home = PUBLIC_ROUTES.find((route) => route.path === ROUTES.home);
  assert.ok(home);
  for (const route of PUBLIC_ROUTES) {
    assert.ok(route.priority > 0 && route.priority <= 1, `${route.path} priority out of range`);
    assert.ok(route.priority <= home.priority);
  }
});
