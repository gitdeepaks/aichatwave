import type { ReactNode } from "react";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingBackdrop, MarketingFooter } from "@/components/marketing/marketing-shell";

/**
 * The public shell: landing and pricing.
 *
 * A route group rather than a directory, so these pages keep the URLs a
 * visitor and a crawler expect — `/` and `/pricing`, not `/marketing/…`.
 *
 * The skip link is first in the DOM and only visible on focus. It is the
 * difference between a keyboard user reaching the page's content immediately
 * and tabbing through the header every time.
 */
export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative min-h-dvh bg-[#08080a] text-zinc-100">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingBackdrop />
      <MarketingHeader />
      <main id="main" tabIndex={-1} className="relative">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
