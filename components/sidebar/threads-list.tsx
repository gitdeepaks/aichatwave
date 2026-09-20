"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Braces,
  FileText,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
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
import type { ThreadDto, ThreadView } from "@/lib/api/contracts";
import { THREADS_QUERY_KEY, threadsQueryKey } from "@/lib/query-keys";
import { chatRoute, isChatRoute, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type ThreadsListProps = {
  view: ThreadView;
  pinned?: boolean;
  label: string;
};

const listItemClass = cn(
  "h-9 w-full rounded-[10px] px-2.5 text-left text-[13px] font-medium transition-all duration-200 ease-out",
  "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100",
  "data-[active=true]:bg-gradient-to-r data-[active=true]:from-orange-500/20 data-[active=true]:to-red-600/12",
  "data-[active=true]:text-white data-[active=true]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/25 active:scale-[0.99]",
);

function firstPageCursor(): string | undefined {
  return undefined;
}

export function ThreadsList({ view, pinned, label }: ThreadsListProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const query = useInfiniteQuery({
    queryKey: threadsQueryKey(view, pinned),
    queryFn: ({ pageParam, signal }) =>
      threadsApi.list({
        view,
        ...(pinned === undefined ? {} : { pinned }),
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
        limit: 30,
        signal,
      }),
    initialPageParam: firstPageCursor(),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const invalidateThreads = () => queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY });

  const updateMutation = useMutation({
    mutationFn: ({
      threadId,
      update,
    }: {
      threadId: string;
      update: Parameters<typeof threadsApi.update>[1];
    }) => threadsApi.update(threadId, update),
    onSuccess: (_thread, variables) => {
      setRenamingId(null);
      void invalidateThreads();
      if (variables.update.archived === true && isChatRoute(pathname, variables.threadId)) {
        router.push(ROUTES.app);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (threadId: string) => threadsApi.remove(threadId),
    onSuccess: (_result, threadId) => {
      void invalidateThreads();
      if (isChatRoute(pathname, threadId)) router.push(ROUTES.app);
      toast.success("Conversation deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const threads = query.data?.pages.flatMap((page) => page.threads) ?? [];

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
    updateMutation.mutate({ threadId, update: { title } });
  };

  return (
    <SidebarGroup className="p-0 group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="mb-1 mt-4 px-3 text-[12px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </SidebarGroupLabel>

      {query.isError ? (
        <div className="px-3 py-2">
          <div className="mb-2 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{query.error.message || "Failed to load threads"}</span>
          </div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="h-8 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs text-zinc-200 transition-colors hover:bg-white/[0.1]"
          >
            Try again
          </button>
        </div>
      ) : (
        <SidebarMenu className="gap-0.5">
          {query.isLoading
            ? /*
                 A placeholder, not a control.

                 These rows used to render `SidebarMenuButton`, which is a real
                 `<button>` — six of them, each containing only a grey
                 rectangle, so each had no accessible name. axe rates that a
                 *critical* `button-name` violation, and it is right: a screen
                 reader announced six anonymous buttons, and they sat in the
                 tab order, where `pointer-events-none` does not reach. Marked
                 `aria-hidden` as well, because "loading" is what the list is
                 doing, not something to enumerate.
               */
              Array.from({ length: pinned ? 2 : 6 }).map((_, index) => (
                <SidebarMenuItem key={index} aria-hidden>
                  <div className={cn(listItemClass, "pointer-events-none")}>
                    <Skeleton className="h-4 w-full bg-white/[0.06]" />
                  </div>
                </SidebarMenuItem>
              ))
            : threads.map((thread) => {
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
                      isActive={pathname === `/chat/${thread.id}`}
                      tooltip={thread.title}
                      className={listItemClass}
                    >
                      <Link href={chatRoute(thread.id)} className="block w-full min-w-0 pr-7">
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
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => startRename(thread)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            updateMutation.mutate({
                              threadId: thread.id,
                              update: { pinned: !thread.pinned },
                            })
                          }
                        >
                          {thread.pinned ? (
                            <PinOff className="mr-2 h-3.5 w-3.5" />
                          ) : (
                            <Pin className="mr-2 h-3.5 w-3.5" />
                          )}
                          {thread.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            updateMutation.mutate({
                              threadId: thread.id,
                              update: { archived: !thread.archived },
                            })
                          }
                        >
                          {thread.archived ? (
                            <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                          ) : (
                            <Archive className="mr-2 h-3.5 w-3.5" />
                          )}
                          {thread.archived ? "Unarchive" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a
                            href={`/api/threads/${encodeURIComponent(thread.id)}/export?format=json`}
                          >
                            <Braces className="mr-2 h-3.5 w-3.5" /> Export JSON
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a
                            href={`/api/threads/${encodeURIComponent(thread.id)}/export?format=markdown`}
                          >
                            <FileText className="mr-2 h-3.5 w-3.5" /> Export Markdown
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => deleteMutation.mutate(thread.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                );
              })}

          {/* `<li>`, not `<div>`. `SidebarMenu` renders a `<ul>`, and a list may
              only contain list items — axe flags a bare child as a `serious`
              violation, and a screen reader announcing "list, 0 items" over
              visible text is the reason it is serious. Same for the button
              below. */}
          {!query.isLoading && threads.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">
              {view === "archived" ? "No archived conversations." : "No conversations yet."}
            </li>
          ) : null}

          {query.hasNextPage ? (
            <li>
              <button
                type="button"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                className="mx-2 mt-1 flex h-8 items-center justify-center gap-2 rounded-lg text-xs text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300 disabled:opacity-50"
              >
                {query.isFetchingNextPage && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                {query.isFetchingNextPage ? "Loading" : "Show older"}
              </button>
            </li>
          ) : null}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}

export default ThreadsList;
