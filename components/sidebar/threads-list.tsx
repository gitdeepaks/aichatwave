"use client";

import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { getThreads } from "@/lib/threads";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
interface Thread {
  id: string;
  title: string;
}

export function ThreadsLists() {
  const pathname = usePathname() ?? "";
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Thread[]>({
    queryKey: ["threads"],
    queryFn: () => getThreads(),
  });

  const listItemClass = cn(
    "h-9 w-full rounded-[10px] px-2.5 text-left text-[13px] font-medium transition-all duration-200 ease-out",
    "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
    "data-[active=true]:bg-gradient-to-r data-[active=true]:from-orange-500/20 data-[active=true]:to-red-600/12",
    "data-[active=true]:text-white data-[active=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/25",
    "active:scale-[0.99]",
  );

  return (
    <SidebarGroup className="p-0 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="mb-1 mt-4 px-3 text-[12px] font-medium uppercase tracking-wider text-zinc-500">
        Recent
      </SidebarGroupLabel>

      {isError ? (
        <div className="px-3 py-2">
          <div className="mb-2 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{error?.message || "Failed to load threads"}</span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="h-8 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs text-zinc-200 transition-colors hover:bg-white/[0.1]"
          >
            Try again
          </button>
        </div>
      ) : (
        <SidebarMenu className="gap-0.5">
          {isLoading || isFetching ? (
            Array.from({ length: 6 }).map((_, index) => (
              <SidebarMenuItem key={index} className="group/item relative">
                <SidebarMenuButton
                  className={cn(listItemClass, "pointer-events-none hover:bg-transparent")}
                >
                  <Skeleton className="h-4 w-full bg-white/[0.06]" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          ) : data && data.length > 0 ? (
            data.map((thread) => {
              const isActive = pathname === `/chat/${thread.id}`;
              return (
                <SidebarMenuItem key={thread.id} className="group/item relative">
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={thread.title}
                    className={listItemClass}
                  >
                    <Link href={`/chat/${thread.id}`} className="block w-full min-w-0">
                      <span className="block w-full truncate leading-5">{thread.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })
          ) : (
            <div className="px-3 py-2 text-xs text-zinc-500">No threads yet.</div>
          )}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}

export default ThreadsLists;
