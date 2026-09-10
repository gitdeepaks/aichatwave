import type { ComponentProps } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarRail } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { SidebarFooterComponent } from "./sidebar-footer";
import ThreadsLists from "./threads-list";
import { MacosSidebarNav } from "./macos-sidebar-nav";

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className={cn(
        "transition-[left,right,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
      )}
      {...props}
    >
      <MacosSidebarNav />

      <SidebarContent className="mt-1 min-h-0 gap-0 px-1">
        <ThreadsLists />
      </SidebarContent>

      <SidebarFooter className="border-t border-white/[0.06] pt-1">
        <SidebarFooterComponent />
      </SidebarFooter>
      <SidebarRail className="after:bg-orange-400/30 hover:after:bg-orange-400/50" />
    </Sidebar>
  );
}
