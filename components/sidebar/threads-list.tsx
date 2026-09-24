"use client";

import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
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
import { useThreadPrefetch } from "@/components/sidebar/hooks/use-thread-prefetch";
import { useThreadListCache } from "@/hooks/use-thread-list-cache";
import { threadsApi } from "@/lib/api/client";
import type { ThreadDto, ThreadView, UpdateThreadRequest } from "@/lib/api/contracts";
import { threadsQueryKey } from "@/lib/query-keys";
import { chatRoute, isChatRoute, ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { forgetChatForThread } from "@/store/chat-store";

type ThreadsListProps = {
  view: ThreadView;
  pinned?: boolean;
  label: string;
};

const listItemClass = cn(
  "h-9 w-full rounded-lg px-2.5 text-left text-sm font-medium transition-all duration-base ease-emphasis",
  "text-fg-muted hover:bg-glass hover:text-fg-strong",
  "data-[active=true]:brand-wash data-[active=true]:text-fg-bright",
  "data-[active=true]:inset-shadow-hairline",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/25 active:scale-[0.99]",
);

function firstPageCursor(): string | undefined {
  return undefined;
}

export function ThreadsList({ view, pinned, label }: ThreadsListProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
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

  const threadCache = useThreadListCache();
  const intentHandlers = useThreadPrefetch();

  /**
   * Rename, pin and archive, applied to the cached sidebar before the request
   * leaves.
   *
   * `onMutate` snapshots every cached list, applies the change, and hands the
   * snapshot to `onError` to put back. The change also carries a fresh
   * `updatedAt`, because the server's own update bumps it and the list is
   * ordered by it — omitting it would show the row in the right shape and the
   * wrong place, and then watch it jump when the refetch landed.
   *
   * There is no `onSettled` invalidation. That is the point of the phase: the
   * client computed the same thing the server did, the response confirms it,
   * and refetching the list to be told so is the round trip this replaces. A
   * rejected request rolls back and says why.
   */
  const updateMutation = useMutation({
    mutationFn: ({ threadId, update }: { threadId: string; update: UpdateThreadRequest }) =>
      threadsApi.update(threadId, update),

    onMutate: ({ threadId, update }) => {
      setRenamingId(null);
      const snapshot = threadCache.snapshot();
      // Spread field by field: under `exactOptionalPropertyTypes` a request's
      // absent `pinned` and a patch's `pinned: undefined` are different types,
      // and only the first one means "leave it alone".
      threadCache.patchThread(threadId, {
        ...(update.title === undefined ? {} : { title: update.title }),
        ...(update.pinned === undefined ? {} : { pinned: update.pinned }),
        ...(update.archived === undefined ? {} : { archived: update.archived }),
        updatedAt: new Date().toISOString(),
      });
      return { snapshot };
    },

    onSuccess: (thread, variables) => {
      // The server is the authority on the row it just wrote — its
      // `updatedAt` is the real one, and a generated title may have landed in
      // the same moment. Replacing the optimistic row with it costs nothing
      // and keeps the two from drifting.
      threadCache.patchThread(thread.id, thread);

      if (variables.update.archived === true && isChatRoute(pathname, variables.threadId)) {
        router.push(ROUTES.app);
      }
    },

    onError: (error: Error, _variables, context) => {
      if (context !== undefined) threadCache.restore(context.snapshot);
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (threadId: string) => threadsApi.remove(threadId),

    onMutate: (threadId) => {
      const snapshot = threadCache.snapshot();
      threadCache.removeThread(threadId);
      // The live chat instance goes with it, or a thread deleted and then
      // recreated with the same id would reopen with the old transcript.
      forgetChatForThread(threadId);
      if (isChatRoute(pathname, threadId)) router.push(ROUTES.app);
      return { snapshot };
    },

    onSuccess: () => {
      toast.success("Conversation deleted");
    },

    onError: (error: Error, _threadId, context) => {
      if (context !== undefined) threadCache.restore(context.snapshot);
      toast.error(error.message);
    },
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
      <SidebarGroupLabel className="mb-1 mt-4 px-3 text-xs font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </SidebarGroupLabel>

      {query.isError ? (
        <div className="px-3 py-2">
          <div className="mb-2 flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{query.error.message || "Failed to load threads"}</span>
          </div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="h-8 rounded-xl border border-hairline bg-glass px-3 text-xs text-fg transition-colors hover:bg-glass-strong"
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
                    <Skeleton className="h-4 w-full bg-glass" />
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
                        className="h-9 w-full rounded-lg border border-brand-text/40 bg-surface-raised/80 px-2.5 text-sm text-fg-strong outline-none"
                      />
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={thread.id} className="group/item relative">
                    <SidebarMenuButton
                      asChild
                      /*
                        The active row was compared against `/chat/{id}`, which
                        has not been a URL since the workspace moved under
                        `/app` — so no thread in the sidebar has been shown as
                        selected since. `isChatRoute` is the one place that
                        knows the shape (`lib/routes.ts`).
                      */
                      isActive={isChatRoute(pathname, thread.id)}
                      tooltip={thread.title}
                      className={listItemClass}
                    >
                      {/*
                        Prefetch is explicit rather than `<Link prefetch>`: this
                        route is dynamic, so the automatic viewport prefetch
                        would stop at the loading boundary and the click would
                        still wait on the server. `useThreadPrefetch` takes the
                        whole segment plus the thread's first message page, on
                        hover, focus or touch.
                      */}
                      <Link
                        href={chatRoute(thread.id)}
                        prefetch={false}
                        className="block w-full min-w-0 pr-7"
                        {...intentHandlers(thread.id)}
                      >
                        <span className="block w-full truncate leading-5">{thread.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Actions for ${thread.title}`}
                          className="absolute right-1 top-1/2 flex h-7 w-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-glass-strong hover:text-fg-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong/25 group-hover/item:opacity-100"
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
            <li className="px-3 py-2 text-xs text-fg-subtle">
              {view === "archived" ? "No archived conversations." : "No conversations yet."}
            </li>
          ) : null}

          {query.hasNextPage ? (
            <li>
              <button
                type="button"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                className="mx-2 mt-1 flex h-8 items-center justify-center gap-2 rounded-lg text-xs text-fg-subtle transition-colors hover:bg-glass hover:text-fg-soft disabled:opacity-50"
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
