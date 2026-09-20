/**
 * Lighthouse CI. Phase K item 6, and the measurement Phase E has been waiting
 * on.
 *
 * ## What blocks, and what only reports
 *
 * SEO, accessibility and best-practices are **assertions**: they are
 * deterministic, they are the scores Phase J claimed, and a regression in any
 * of them is a defect rather than weather.
 *
 * Performance is collected and **reported, not enforced**. A shared CI runner
 * produces performance numbers with a spread wide enough that a blocking
 * threshold would either be set so low it catches nothing or so high it fails
 * on a noisy neighbour. The real performance gate is Phase L's: p95 budgets
 * measured on the production deployment and recorded in the SLO dashboard.
 * Blocking here would buy flakiness and sell the illusion of coverage.
 *
 * ## Authenticated routes
 *
 * `LHCI_EXTRA_HEADERS` carries the signed-in Clerk session, produced by
 * `scripts/lighthouse-session.ts` from the storage state the Playwright setup
 * project already wrote. Without it only the public routes are collected,
 * which is what happens on a machine that has not run the E2E setup.
 *
 * CommonJS because that is what `@lhci/cli` loads and this package is not
 * `"type": "module"`.
 */

const BASE_URL = process.env.LHCI_BASE_URL || "http://127.0.0.1:3000";

const PUBLIC_URLS = ["/", "/pricing"];
const AUTHENTICATED_URLS = ["/app", "/app/memories", "/app/profile"];

/**
 * Parsed rather than passed through: an unset or malformed value must collect
 * the public routes rather than fail the run, because the public routes are
 * the ones whose SEO scores this gate exists to protect.
 */
function extraHeaders() {
  const raw = process.env.LHCI_EXTRA_HEADERS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const headers = extraHeaders();
const urls = [...PUBLIC_URLS, ...(headers ? AUTHENTICATED_URLS : [])];

module.exports = {
  ci: {
    collect: {
      url: urls.map((path) => `${BASE_URL}${path}`),
      // The server is started by the CI job and shared with the E2E run, so
      // Lighthouse must not try to start or stop one of its own.
      startServerCommand: undefined,
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        // Clerk, the provider SDKs and the OTel exporter all log to the
        // console in ways that are not this product's defect to fix.
        skipAudits: ["uses-http2"],
        ...(headers ? { extraHeaders: headers } : {}),
      },
    },
    assert: {
      assertions: {
        "categories:seo": ["error", { minScore: 0.98 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        // Reported, never blocking. See the note above.
        "categories:performance": ["warn", { minScore: 0.8 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
};
