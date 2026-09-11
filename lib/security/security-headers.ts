/**
 * The production security headers, built as pure data.
 *
 * Pure and parameterised rather than reading `lib/env.ts`, because this runs in
 * the middleware. `lib/env.ts` validates the whole process environment as an
 * import side effect and throws when it is incomplete; pulling that into the
 * edge runtime would make a missing, unrelated key take down every request
 * including the ones that need no configuration at all.
 *
 * ## What the CSP is for
 *
 * `script-src` is the directive that matters. It carries a per-request nonce
 * and `'strict-dynamic'`, and — deliberately — no `'unsafe-inline'`, so an
 * injected `<script>` does not execute even if an XSS hole exists somewhere in
 * the app. `'strict-dynamic'` is what makes that workable with Next.js and
 * Clerk: Next's own bundle carries the nonce, and any script it loads at
 * runtime (Clerk's `clerk-js`, the font loader) inherits trust from it rather
 * than needing to be listed by origin.
 *
 * ## Why `style-src` keeps `'unsafe-inline'`
 *
 * Not an oversight, and not laziness. Shiki — which Streamdown uses to
 * highlight every code block in a chat answer — emits one inline `style`
 * attribute per coloured span, Clerk's components inject their own `<style>`
 * elements without a nonce, and React's `style` prop produces the same. There
 * is no nonce to give any of them. The realistic alternatives are a broken UI
 * or this, and the risk is not comparable to script injection: exploiting a
 * style-only injection needs an attacker who can already inject markup, at
 * which point `script-src` is the control that is actually holding.
 *
 * Note that a nonce and `'unsafe-inline'` cancel each other out in the same
 * directive — modern browsers ignore `'unsafe-inline'` once a nonce is present
 * — so `style-src` deliberately carries no nonce. Adding one would silently
 * disable the keyword it depends on.
 */

export type SecurityHeaderOptions = {
  /** Per-request CSP nonce, base64. Generate with {@link generateNonce}. */
  nonce: string;
  /** `true` in development: Next's dev runtime needs `eval` and websockets. */
  isDevelopment: boolean;
  /** Whether the request arrived over TLS. HSTS is only sent when it did. */
  isSecure: boolean;
  /** Emits `Content-Security-Policy-Report-Only` instead, for a staged rollout. */
  reportOnly: boolean;
};

/**
 * Origins the browser must be allowed to reach, beyond `'self'`.
 *
 * Clerk is listed by wildcard because the Frontend API host is derived from the
 * publishable key and differs per instance (`*.clerk.accounts.dev` in
 * development, a custom `clerk.<domain>` in production); pinning it here would
 * mean a CSP change on every environment.
 */
const CLERK_ORIGINS = [
  "https://*.clerk.accounts.dev",
  "https://*.clerk.com",
  "https://clerk.io",
  "https://*.clerk.io",
];

const CLERK_TELEMETRY_ORIGINS = ["https://clerk-telemetry.com", "https://*.clerk-telemetry.com"];

/** Cloudflare Turnstile, which Clerk uses for bot protection on sign-up. */
const CHALLENGE_ORIGINS = ["https://challenges.cloudflare.com"];

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(options: SecurityHeaderOptions): string {
  const { nonce, isDevelopment } = options;

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        // Next.js's dev server compiles and evaluates on the client; there is
        // no nonce that covers it. Never sent in production.
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ],
    ],
    // See the note above: nonce-free on purpose, so 'unsafe-inline' applies.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["font-src", ["'self'", "data:"]],
    [
      "img-src",
      [
        "'self'",
        "blob:",
        "data:",
        // SerpAPI product thumbnails and Yahoo Finance article images are
        // third-party URLs chosen at runtime, so they cannot be enumerated.
        // Phase E moves them behind `next/image`, at which point this can
        // narrow to 'self' plus the configured remotePatterns.
        "https:",
      ],
    ],
    [
      "connect-src",
      [
        "'self'",
        ...CLERK_ORIGINS,
        ...CLERK_TELEMETRY_ORIGINS,
        // Next's dev server pushes HMR updates over a websocket.
        ...(isDevelopment ? ["ws:", "wss:"] : []),
      ],
    ],
    ["frame-src", ["'self'", ...CHALLENGE_ORIGINS, ...CLERK_ORIGINS]],
    // Clerk runs its bot-protection and session work in a blob worker.
    ["worker-src", ["'self'", "blob:"]],
    ["media-src", ["'self'", "blob:", "data:"]],
    ["manifest-src", ["'self'"]],
    // No plugins, and no way to re-point a relative URL at another origin.
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    // Forms may only post back to this app — the CSP-level counterpart of the
    // cross-origin check on the API.
    ["form-action", ["'self'", ...CLERK_ORIGINS]],
    // The modern replacement for X-Frame-Options, which is still sent below
    // for browsers that predate it.
    ["frame-ancestors", ["'none'"]],
    ...(options.isSecure ? [["upgrade-insecure-requests", []] satisfies [string, string[]]] : []),
  ];

  return directives
    .map(([name, values]) => (values.length === 0 ? name : `${name} ${values.join(" ")}`))
    .join("; ");
}

/**
 * Every response header this app sets for security, as name/value pairs.
 *
 * `Permissions-Policy` allows `microphone` for this origin because the composer
 * has a speech-input button; every other powerful feature is denied outright
 * rather than left at the browser default, so a dependency cannot quietly start
 * using one.
 */
export function buildSecurityHeaders(options: SecurityHeaderOptions): Array<[string, string]> {
  const csp = buildContentSecurityPolicy(options);

  return [
    [options.reportOnly ? "content-security-policy-report-only" : "content-security-policy", csp],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["x-frame-options", "DENY"],
    [
      "permissions-policy",
      [
        "accelerometer=()",
        "autoplay=()",
        "camera=()",
        "display-capture=()",
        "encrypted-media=()",
        "fullscreen=(self)",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=(self)",
        "midi=()",
        "payment=()",
        "publickey-credentials-get=(self)",
        "screen-wake-lock=()",
        "usb=()",
        "xr-spatial-tracking=()",
      ].join(", "),
    ],
    // Isolates this origin's browsing context group, so a window it opens (or
    // that opens it) cannot reach into it via `window.opener`.
    ["cross-origin-opener-policy", "same-origin"],
    ["cross-origin-resource-policy", "same-origin"],
    ["x-dns-prefetch-control", "off"],
    // Two years, subdomains included, and preload-eligible. Sent only over TLS:
    // a browser ignores it on plain HTTP anyway, and sending it in local
    // development would pin localhost to HTTPS in the developer's browser for
    // two years, which is a genuinely painful thing to undo.
    ...(options.isSecure
      ? [
          ["strict-transport-security", "max-age=63072000; includeSubDomains; preload"] satisfies [
            string,
            string,
          ],
        ]
      : []),
  ];
}
