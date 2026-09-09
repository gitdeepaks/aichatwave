import type { Metadata } from "next";
import { Geist_Mono, Sora } from "next/font/google";

import "streamdown/styles.css";
import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";

import QueryProvider from "@/components/custom/query-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { appUrl } from "@/lib/env";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "AIChatWave";
const DESCRIPTION = "AIChatWave — chat for coders who want to work with AI";
const BASE_URL = appUrl();

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: "AIChatWave,aichatwave,ai chat wave",
  authors: [
    {
      name: "AIChatWave",
      url: BASE_URL,
    },
  ],
  creator: "AIChatWave",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "AIChatWave",
    images: [
      {
        url: `${BASE_URL}/og.jpg`,
        width: 1200,
        height: 630,
        alt: TITLE,
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@aichatwave",
    images: [`${BASE_URL}/og.jpg`],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

/**
 * Font wiring, which was previously broken app-wide.
 *
 * Tailwind's preflight sets `font-family: var(--font-sans)` on <html>, and
 * `--font-sans` maps to `--font-sora`. The Next font variables were declared on
 * <body>, so at <html> level `--font-sora` was undefined and every element fell
 * back to system-ui — Sora was loaded and never used.
 *
 * They cannot simply move to <html> either: `next-themes` runs with
 * `attribute="class"` and rewrites the <html> className, which strips them.
 *
 * So the variables stay on <body> and <body> carries `font-sans`, which
 * re-resolves `--font-sans` in a scope where `--font-sora` exists.
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
          appearance={{
            // Element-level styling lives in `app/globals.css` under
            // `.auth-clerk`; @clerk/ui v1 does not apply `appearance.elements`.
            theme: shadcn,
            variables: {
              colorPrimary: "#fb923c",
              colorBackground: "transparent",
              colorForeground: "#fafafa",
              colorMutedForeground: "#a1a1aa",
              borderRadius: "1rem",
            },
          }}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>{children}</QueryProvider>
            <Toaster position="bottom-right" richColors closeButton duration={4000} />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
