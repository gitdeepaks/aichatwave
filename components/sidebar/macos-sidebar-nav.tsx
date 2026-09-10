"use client";

import { Database, LayoutGrid, Plus, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";

const primaryNav = [
  { title: "New chat", icon: Plus, href: "/", match: (path: string) => path === "/" },
  { title: "Search", icon: Search, href: "/", match: () => false },
  { title: "Images", icon: LayoutGrid, href: "/", match: () => false },
  {
    title: "Memories",
    icon: Database,
    href: "/memories",
    match: (path: string) => path.startsWith("/memories"),
  },
] as const;

const macosItemClass =
  "h-9 rounded-[10px] px-2.5 text-[13px] font-medium text-zinc-300 transition-colors duration-200 ease-out " +
  "hover:bg-white/[0.08] hover:text-white " +
  "data-[active=true]:bg-gradient-to-r data-[active=true]:from-orange-500/25 data-[active=true]:to-red-600/15 " +
  "data-[active=true]:text-white data-[active=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] " +
  "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0";

export function MacosSidebarNav() {
  const pathname = usePathname() ?? "";

  return (
    <>
      <SidebarHeader className="gap-3 px-2 pb-1 pt-3">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-gradient-to-br from-orange-500/30 to-red-600/15 ring-1 ring-white/10 shadow-[0_2px_12px_-4px_rgba(249,115,22,0.35)]">
              <Image
                src={BRAND_LOGO_SRC}
                alt="AIChatWave"
                width={512}
                height={285}
                className="h-6 w-6 object-contain"
                priority
                unoptimized
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

      <SidebarGroup className="p-0 px-1.5">
        <SidebarMenu className="gap-0.5">
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
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
