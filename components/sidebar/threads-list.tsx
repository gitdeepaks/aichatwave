"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { threadsApi } from "@/lib/api/client";
import type { ThreadDto } from "@/lib/api/contracts";
import { cn } from "@/lib/utils";

export const THREADS_QUERY_KEY = ["threads"] as const;

export function ThreadsLists() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: THREADS_QUERY_KEY,
    queryFn: () => threadsApi.list(),
  });

  const invalidateThreads = () => queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY });

  const renameMutation = useMutation({
    mutationFn: (variables: { threadId: string; title: string }) =>
      threadsApi.update(variables.threadId, { title: variables.title }),
    onSuccess: () => {
      setRenamingId(null);
      void invalidateThreads();
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (threadId: string) => threadsApi.remove(threadId),
    onSuccess: (_result, threadId) => {
      void invalidateThreads();
      if (pathname === `/chat/${threadId}`) router.push("/");
      toast.success("Conversation deleted");
    },
    onError: (mutationError: Error) => toast.error(mutationError.message),
  });

  const listItemClass = cn(
    "h-9 w-full rounded-[10px] px-2.5 text-left text-[13px] font-medium transition-all duration-200 ease-out",
    "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
    "data-[active=true]:bg-gradient-to-r data-[active=true]:from-orange-500/20 data-[active=true]:to-red-600/12",
    "data-[active=true]:text-white data-[active=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/25",
    "active:scale-[0.99]",
  );

  const startRename = (thread: ThreadDto) => {
    setRenamingId(thread.id);
    setDraftTitle(thread.title);
  };

  const commitRename = (threadId: string) => {
    const title = draftTitle.trim();
    if (title.length === 0) {
      setRenamingId(null);
      return;
    }
    renameMutation.mutate({ threadId, title });
  };

  return (
    <SidebarGroup className="p-0 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="mb-1 mt-4 px-3 text-[12px] font-medium uppercase tracking-wider text-zinc-500">
        Recent
      </SidebarGroupLabel>

      {isError ? (
        <div className="px-3 py-2">
          <div className="mb-2 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{error.message || "Failed to load threads"}</span>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="h-8 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs text-zinc-200 transition-colors hover:bg-white/[0.1]"
          >
            Try again
          </button>
        </div>
      ) : (
        <SidebarMenu className="gap-0.5">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <SidebarMenuItem key={index}>
                <SidebarMenuButton
                  className={cn(listItemClass, "pointer-events-none hover:bg-transparent")}
                >
                  <Skeleton className="h-4 w-full bg-white/[0.06]" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          ) : data && data.threads.length > 0 ? (
            data.threads.map((thread) => {
              const isActive = pathname === `/chat/${thread.id}`;

              if (renamingId === thread.id) {
                return (
                  <SidebarMenuItem key={thread.id}>
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={() => commitRename(thread.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename(thread.id);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      aria-label="Conversation title"
                      className="h-9 w-full rounded-[10px] border border-orange-300/40 bg-zinc-900/80 px-2.5 text-[13px] text-zinc-100 outline-none"
                    />
                  </SidebarMenuItem>
                );
              }

              return (
                <SidebarMenuItem key={thread.id} className="group/item relative">
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={thread.title}
                    className={listItemClass}
                  >
                    <Link href={`/chat/${thread.id}`} className="block w-full min-w-0 pr-7">
                      <span className="block w-full truncate leading-5">{thread.title}</span>
                    </Link>
                  </SidebarMenuButton>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${thread.title}`}
                        className="absolute right-1 top-1/2 flex h-7 w-6 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-zinc-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/25 group-hover/item:opacity-100"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => startRename(thread)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => deleteMutation.mutate(thread.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
