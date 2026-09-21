import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { AiChatWaveDropdown } from "@/components/chat/aichatwave-dropdown";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { ModelSelectorComponent } from "@/components/model-selector";
import { OnboardingDialog } from "@/components/onboarding/onboarding-dialog";
import { QueryCacheSync } from "@/components/custom/query-cache-sync";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { ProUpgradeCta } from "@/components/pro-upgrade-cta";
import { BrandAtmosphere } from "@/components/brand/brand-atmosphere";

/**
 * Nothing under `/app` belongs in an index.
 *
 * Every route here requires a session, so a crawler would only ever see a
 * redirect — but stating it is what makes an accidentally-cached page drop out
 * instead of lingering. `robots.txt` says the same thing at the crawl layer;
 * this says it at the page layer, and the two failure modes are different
 * enough to be worth both.
 *
 * The title template is inherited from the root layout, so a child page's
 * `title: "Memory Center"` renders as `Memory Center · AIChatWave`.
 */
export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · AIChatWave" },
  robots: { index: false, follow: false, nocache: true },
};

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await auth.protect();

  return (
    <BrandAtmosphere fillViewport>
      {/* First in the DOM, visible only on focus. Without it a keyboard user
          tabs the sidebar's entire thread list before reaching the composer,
          on every navigation. */}
      <a href="#workspace-main" className="skip-link">
        Skip to conversation
      </a>

      <SidebarProvider className="h-full min-h-0 w-full overflow-hidden bg-transparent">
        <AppSidebar />
        {/* The skip target is `SidebarInset` itself, not an element inside it.
            `SidebarInset` renders a `<main>` — it is shadcn output, so that is
            not editable here — and wrapping another `<main>` inside it gave the
            document two `main` landmarks, which is invalid and leaves a screen
            reader's landmark list ambiguous. Verified in the browser: the page
            reported two. Putting `id` and `tabIndex` on the inset makes the one
            real landmark the thing the skip link jumps to, which is what it
            should have been. */}
        <SidebarInset
          id="workspace-main"
          tabIndex={-1}
          className="min-h-0 overflow-hidden bg-transparent focus-visible:outline-none"
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden text-zinc-100">
            <header className="relative flex h-15 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950/40 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/25">
              <div className="flex md:hidden">
                <SidebarTrigger className="text-zinc-300 hover:bg-white/10 hover:text-white" />
              </div>
              <div className="hidden items-center md:flex">
                <AiChatWaveDropdown />
              </div>

              <ProUpgradeCta />

              <div className="flex items-center">
                <ModelSelectorComponent />
              </div>
            </header>

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>

      {/* Mounted at the layout so ⌘K works on every workspace route, and so the
          consent question is asked once per account rather than once per page. */}
      {/* The persisted client cache, connected for as long as the workspace is
          open. Here rather than beside `QueryProvider` in the root layout,
          which would put Clerk's client runtime in the landing page's bundle. */}
      <QueryCacheSync />
      <CommandPalette />
      <OnboardingDialog />
    </BrandAtmosphere>
  );
}
