import type { Metadata, Viewport } from "next";
import { Geist_Mono, Sora } from "next/font/google";

import "streamdown/styles.css";
import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { ui as clerkUi } from "@clerk/ui";
import { shadcn } from "@clerk/ui/themes";

import QueryProvider from "@/components/custom/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { appUrl } from "@/lib/env";
import { ROUTES } from "@/lib/routes";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  TWITTER_HANDLE,
} from "@/lib/seo/site";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Clerk's prebuilt theme, minus `cssLayerName`.
 *
 * `@clerk/ui` declares that field as `string | undefined` while
 * `@clerk/nextjs` expects it as exact-optional, so passing the theme through
 * unchanged does not typecheck under `exactOptionalPropertyTypes`. Dropping a
 * field the app never sets keeps the theme intact and the types honest.
 */
const { cssLayerName: _cssLayerName, ...clerkTheme } = shadcn;

const BASE_URL = appUrl();

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  /**
   * `template` rather than a bare string: every child route sets its own
   * `title` and gets ` · AIChatWave` appended for free, so a new page cannot
   * ship with the site name missing from its SERP entry. `default` is what the
   * root and any route that declines to set one fall back to.
   */
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: BASE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  /*
   * Deliberately no `alternates.canonical` here.
   *
   * It was set to `ROUTES.home`, and `metadata` inherits — so every route that
   * did not override it, which is `/sign-in`, `/sign-up` and all seven pages
   * under `/app`, shipped `<link rel="canonical" href="https://…/">`. Each of
   * them was telling a crawler "the real version of this page is the
   * homepage", which is both untrue and pointless on a page already marked
   * `noindex`. Lighthouse flagged it on `/sign-in`: "Points to the domain's
   * root URL, instead of an equivalent page of content".
   *
   * A canonical belongs only on a page that wants to be indexed, so the two
   * that do — `/` and `/pricing` — declare their own. `metadataBase` below is
   * what makes those relative values resolve, and is the part that genuinely
   * has to be inherited: without it a page rendered on a Vercel preview
   * hostname declares itself canonical at that hostname and competes with
   * production in the index. See Deployment state item 1 in
   * `docs/pro_plan.md` for why `NEXT_PUBLIC_APP_URL` must actually be set.
   */
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE.path,
        width: OG_IMAGE.width,
        height: OG_IMAGE.height,
        alt: OG_IMAGE.alt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    creator: TWITTER_HANDLE,
    images: [OG_IMAGE.path],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

/**
 * Dark, and only dark.
 *
 * `colorScheme` is the declaration that used to be missing: `<html class="dark">`
 * styled this app's own surfaces and left the browser's — scrollbars, the
 * overscroll canvas, native form controls — rendering light. `themeColor`
 * paints the mobile browser chrome the same zinc as the page behind it. Both
 * restate one decision, recorded in `docs/adr/0005-dark-theme-only.md` and in
 * the header of `app/globals.css`: this product ships one theme.
 */
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#09090b",
};

/**
 * Font wiring, which was previously broken app-wide.
 *
 * Tailwind's preflight sets `font-family: var(--font-sans)` on <html>, and
 * `--font-sans` maps to `--font-sora`. The Next font variables were declared on
 * <body>, so at <html> level `--font-sora` was undefined and every element fell
 * back to system-ui — Sora was loaded and never used.
 *
 * They stay on <body> rather than moving to <html>, and <body> carries
 * `font-sans` so `--font-sans` re-resolves in a scope where `--font-sora`
 * exists. A3 established the constraint behind that (a theme library rewriting
 * the <html> className strips them); the pass-through `ThemeProvider` that
 * once stood in for such a library is gone, because a provider that renders
 * `<div class="contents">` and nothing else is a comment pretending to be
 * code. The class stays on <html> because Tailwind's `dark:` variant resolves
 * through it.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${sora.variable} ${geistMono.variable} bg-zinc-950 font-sans text-zinc-100 antialiased`}
        suppressHydrationWarning
      >
        <ClerkProvider
          /**
           * Makes Clerk's own script tags carry this request's CSP nonce.
           *
           * Without it, `<ClerkProvider>` renders `clerk.browser.js` and
           * `ui.browser.js` into the SSR HTML with no nonce. Those tags are
           * parser-inserted, and `script-src` here carries `'strict-dynamic'`,
           * which makes `'self'` and every host source inert — so the browser
           * refuses both, logs two CSP errors, and Clerk's local runtime then
           * re-injects them dynamically, where `'strict-dynamic'` does allow
           * them. The app worked, which is why this went unnoticed; it worked
           * by paying two blocked requests and a retry on every single page
           * load, and by putting a security error in every user's console.
           *
           * Found by Lighthouse, not by looking: `errors-in-console` and
           * `inspector-issues` both failed and named the two scripts.
           *
           * `dynamic` is what switches Clerk to its `DynamicClerkScripts`
           * path, which reads `X-Nonce` from the request headers — the header
           * `proxy.ts` already sets — and stamps it on the tags. It also opts
           * this subtree into dynamic rendering, which costs nothing here
           * because the nonce CSP already requires every page to be dynamic.
           */
          dynamic
          /**
           * Pins the version of Clerk's component DOM this app renders against.
           *
           * Added after Clerk's own runtime warning
           * (`structural_css_pin_clerk_ui`) named it: the `.auth-clerk` rules in
           * `app/globals.css` target `cl-*` class names, and without a pin those
           * names belong to whatever component version Clerk has deployed today.
           * A rename would break the auth screen silently — nothing fails to
           * compile and no test catches it; it just looks wrong.
           *
           * With `ui` passed, the components are the bundled ones from the
           * `@clerk/ui` version in `package.json`, so the selectors move only
           * when that dependency is upgraded deliberately. See
           * `docs/adr/0009-clerk-appearance-via-css.md`.
           */
          ui={clerkUi}
          appearance={{
            // Element-level styling lives in `app/globals.css` under
            // `.auth-clerk` rather than in `appearance.elements`, which did not
            // reach the DOM when this was built. See ADR-0009 — the `ui` pin
            // above is what makes those selectors safe to depend on.
            theme: clerkTheme,
            variables: {
              colorPrimary: "#fb923c",
              colorBackground: "transparent",
              colorForeground: "#fafafa",
              colorMutedForeground: "#a1a1aa",
              borderRadius: "1rem",
            },
          }}
          /**
           * Where Clerk sends a user it has just authenticated.
           *
           * Required since the workspace moved off `/`: Clerk's own default is
           * the site root, which is now the marketing page, so without these a
           * completed sign-in would land on the landing page and look like it
           * had failed. `fallback` rather than `force` so a `redirect_url` on
           * the sign-in link — the one a protected route adds when it bounces
           * you — still wins and returns you to the page you asked for.
           */
          signInFallbackRedirectUrl={ROUTES.app}
          signUpFallbackRedirectUrl={ROUTES.app}
          afterSignOutUrl={ROUTES.home}
        >
          <QueryProvider>{children}</QueryProvider>
          <Toaster position="bottom-right" richColors closeButton duration={4000} />
        </ClerkProvider>
      </body>
    </html>
  );
}
