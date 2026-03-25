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
interface Thread {
  id: string;
  title: string;
}

export function ThreadsLists() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<Thread[]>({
    queryKey: ["threads"],
    queryFn: () => getThreads(),
  });

  const listItemClass = cn(
    "h-10 w-full rounded-xl px-3 text-left transition-all duration-200",
    "text-[#b4b4b4] hover:bg-[#2f2f2f] hover:text-[#ececec]",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#4a4a4a]",
    "active:scale-[0.99]",
  );

  return (
    <SidebarGroup className="p-0 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="mb-1 mt-4 px-3 text-[12px] font-medium text-[#b4b4b4]">
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
            className="h-8 rounded-md bg-[#2f2f2f] px-3 text-xs text-[#ececec] transition-colors hover:bg-[#3a3a3a]"
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
                  <Skeleton className="h-4 w-full bg-[#212121]" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          ) : data && data.length > 0 ? (
            data.map((thread) => (
              <SidebarMenuItem key={thread.id} className="group/item relative">
                <Link href={`/chat/${thread.id}`}>
                  <SidebarMenuButton className={listItemClass} tooltip={thread.title}>
                    <span className="block w-full truncate text-sm font-medium leading-5">
                      {thread.title}
                    </span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-[#8f8f8f]">No threads yet.</div>
          )}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}

export default ThreadsLists;
