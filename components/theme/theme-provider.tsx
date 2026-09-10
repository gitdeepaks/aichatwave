import type * as React from "react";

// Minimal ThemeProvider.
// We intentionally do NOT use `next-themes` here because it injects an inline <script>
// tag. In Next.js 16 + Turbopack + React 19 this triggers a console warning:
// "Encountered a script tag while rendering React component..."
//
// Your app already sets `className="dark"` on <html> in `app/layout.tsx`, so this
// provider is currently just a pass-through.
export function ThemeProvider({ children }: React.PropsWithChildren) {
  // Multiple layout children (e.g. QueryProvider + Toaster) arrive as an array.
  // Returning that array directly triggers React's "unique key" warning; wrap so
  // we return a single tree root.
  return <div className="contents">{children}</div>;
}
