"use client";

import { Archive, Database, Plus, Search, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import type { ThreadView } from "@/lib/api/contracts";
import { ROUTES, type AppRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useCommandPaletteStore } from "@/store/command-palette-store";

/**
 * The fixed destinations above the thread list.
 *
 * `match` is a predicate rather than a prefix string because "new chat" is
 * active only on the workspace root — `/app` is a prefix of every thread URL,
 * so `startsWith` would light it up for the whole app.
 *
 * The "Images" entry that used to sit here pointed at the same href as "New
 * chat" with `match: () => false`, i.e. a nav item that went somewhere else
 * and could never look selected. There is no images surface to link to, so it
 * is gone rather than carried as a decoy.
 */
const primaryNav = [
  {
    title: "New chat",
    icon: Plus,
    href: ROUTES.app,
    match: (path: string) => path === ROUTES.app,
  },
  {
    title: "Memories",
    icon: Database,
    href: ROUTES.memories,
    match: (path: string) => path.startsWith(ROUTES.memories),
  },
] as const satisfies ReadonlyArray<{
  title: string;
  icon: LucideIcon;
  href: AppRoute;
  match: (path: string) => boolean;
}>;

const macosItemClass =
  "h-9 rounded-[10px] px-2.5 text-[13px] font-medium text-zinc-300 transition-colors duration-200 ease-out " +
  "hover:bg-white/[0.08] hover:text-white " +
  "data-[active=true]:bg-gradient-to-r data-[active=true]:from-orange-500/25 data-[active=true]:to-red-600/15 " +
  "data-[active=true]:text-white data-[active=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] " +
  "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0";

export function MacosSidebarNav({
  view,
  onViewChange,
}: {
  view: ThreadView;
  onViewChange: (view: ThreadView) => void;
}) {
  const pathname = usePathname() ?? "";
  // The palette owns the ⌘K binding and its own open state, so this button
  // only has to ask for it. Two components listening for the same chord is how
  // one of them ends up handling it twice.
  const openPalette = useCommandPaletteStore((state) => state.open);

  return (
    <>
      <SidebarHeader role="banner" className="gap-3 px-2 pb-1 pt-3">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-gradient-to-br from-orange-500/30 to-red-600/15 ring-1 ring-white/10 shadow-[0_2px_12px_-4px_rgba(249,115,22,0.35)]">
              <Image
                src={BRAND_LOGO_SRC}
                alt="AIChatWave"
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
                priority
              />
            </div>
            <span className="truncate text-[15px] font-semibold tracking-tight text-white group-data-[collapsible=icon]:hidden">
              AIChatWave
            </span>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <SidebarTrigger
              className={cn(
                "h-8 w-8 shrink-0 rounded-lg text-zinc-400",
                "hover:bg-white/10 hover:text-zinc-100",
                "transition-colors duration-200",
              )}
            />
          </div>
        </div>
      </SidebarHeader>

      {/* A landmark, because otherwise none of this is in one. axe's `region`
          rule wants every piece of content inside a landmark, and shadcn's
          `Sidebar` is a stack of plain divs — so the brand header, the nav
          items and the thread list all sat outside any region. `SidebarGroup`
          spreads props onto its div, which is the seam that lets this be fixed
          without editing vendored output. */}
      <SidebarGroup role="navigation" aria-label="Primary" className="p-0 px-1.5">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              tooltip="Search"
              onClick={openPalette}
              className={macosItemClass}
            >
              <Search className="h-4 w-4 shrink-0 text-zinc-500 transition-colors" />
              <span className="group-data-[collapsible=icon]:hidden">Search</span>
              <kbd className="ml-auto text-[10px] text-zinc-600 group-data-[collapsible=icon]:hidden">
                ⌘K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.match(pathname);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.title}
                  className={macosItemClass}
                >
                  <Link
                    href={item.href}
                    onClick={() => onViewChange("active")}
                    className={cn(
                      "flex w-full items-center gap-2.5",
                      !isActive && "hover:[&_svg]:text-orange-200/85",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive ? "text-orange-300" : "text-zinc-500",
                      )}
                    />
                    <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              isActive={view === "archived"}
              tooltip="Archived"
              onClick={() => onViewChange(view === "archived" ? "active" : "archived")}
              className={macosItemClass}
            >
              <Archive
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  view === "archived" ? "text-orange-300" : "text-zinc-500",
                )}
              />
              <span className="group-data-[collapsible=icon]:hidden">Archived</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
