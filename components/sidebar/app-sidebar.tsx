"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarRail } from "@/components/ui/sidebar";
import type { ThreadView } from "@/lib/api/contracts";
import { cn } from "@/lib/utils";
import { SidebarFooterComponent } from "./sidebar-footer";
import ThreadsLists from "./threads-list";
import { MacosSidebarNav } from "./macos-sidebar-nav";

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const [view, setView] = useState<ThreadView>("active");

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className={cn(
        "transition-[left,right,width] duration-slow ease-emphasis",
      )}
      {...props}
    >
      <MacosSidebarNav view={view} onViewChange={setView} />

      <SidebarContent
        role="navigation"
        aria-label="Conversations"
        className="mt-1 min-h-0 gap-0 px-1"
      >
        {view === "active" ? (
          <>
            <ThreadsLists view="active" pinned label="Pinned" />
            <ThreadsLists view="active" pinned={false} label="Recent" />
          </>
        ) : (
          <ThreadsLists view="archived" label="Archived" />
        )}
      </SidebarContent>

      <SidebarFooter role="contentinfo" className="border-t border-hairline-subtle pt-1">
        <SidebarFooterComponent />
      </SidebarFooter>
      <SidebarRail className="after:bg-brand/30 hover:after:bg-brand/50" />
    </Sidebar>
  );
}
