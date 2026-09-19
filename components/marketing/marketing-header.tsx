import { Show } from "@clerk/nextjs";
import Link from "next/link";

import { BrandMark, Container, primaryButtonClass } from "@/components/marketing/marketing-shell";
import { ROUTES } from "@/lib/routes";
import { SITE_NAME } from "@/lib/seo/site";

/**
 * The public header.
 *
 * A **server** component, which is what lets the right-hand action differ for
 * a visitor and for someone already signed in without a flash of the wrong
 * one. Sending a signed-in user to "Start free" is the smallest possible
 * insult; sending them to `/sign-in` is worse, because Clerk bounces them
 * straight back and the click appears to have done nothing.
 *
 * `<Show when="signed-in">` is Clerk Core 3's replacement for `<SignedIn>` and
 * `<SignedOut>`, which were removed in `@clerk/nextjs` v7 and now throw when
 * rendered. It resolves on the server against the request's session, so the
 * HTML that ships is already correct — unlike the client-hook version, which
 * renders the signed-out state first and swaps it once Clerk loads.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/60 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/40">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href={ROUTES.home} className="rounded-lg" aria-label={`${SITE_NAME} home`}>
          <BrandMark />
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link
            href={ROUTES.pricing}
            className="rounded-full px-3 py-2 text-[14px] font-medium text-zinc-400 transition-colors hover:text-white motion-reduce:transition-none"
          >
            Pricing
          </Link>

          <Show
            when="signed-in"
            fallback={
              <>
                <Link
                  href={ROUTES.signIn}
                  className="rounded-full px-3 py-2 text-[14px] font-medium text-zinc-400 transition-colors hover:text-white motion-reduce:transition-none"
                >
                  Sign in
                </Link>
                <Link href={ROUTES.signUp} className={`${primaryButtonClass} h-9 px-4 text-[13px]`}>
                  Start free
                </Link>
              </>
            }
          >
            <Link href={ROUTES.app} className={`${primaryButtonClass} h-9 px-4 text-[13px]`}>
              Open workspace
            </Link>
          </Show>
        </nav>
      </Container>
    </header>
  );
}
