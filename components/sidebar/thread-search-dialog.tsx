"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Archive, LoaderCircle, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { messagePartsToPlainText } from "@/lib/ai/message-parts";
import { threadsApi } from "@/lib/api/client";
import { threadSearchQueryKey } from "@/lib/query-keys";

function firstPageCursor(): string | undefined {
  return undefined;
}

export function ThreadSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [input]);

  const search = useInfiniteQuery({
    queryKey: threadSearchQueryKey(query),
    queryFn: ({ pageParam, signal }) =>
      threadsApi.search(query, {
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
        limit: 20,
        signal,
      }),
    initialPageParam: firstPageCursor(),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: open && query.length > 0,
  });

  const results = search.data?.pages.flatMap((page) => page.results) ?? [];
  const waitingForDebounce = input.trim() !== query;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-white/10 bg-zinc-950/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Search messages</DialogTitle>
          <DialogDescription>Search message history across your conversations.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="bg-transparent text-zinc-100">
          <CommandInput
            autoFocus
            value={input}
            onValueChange={setInput}
            placeholder="Search messages..."
            aria-label="Search messages"
            className="text-zinc-100 placeholder:text-zinc-600"
          />
          <CommandList className="max-h-[min(65dvh,32rem)] px-2 py-2">
            {input.trim().length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-zinc-500">
                <MessageSquareText className="h-5 w-5 text-orange-300/70" />
                Search words from any conversation.
              </div>
            ) : waitingForDebounce || search.isLoading ? (
              <div
                className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500"
                role="status"
              >
                <LoaderCircle className="h-4 w-4 animate-spin" /> Searching messages
              </div>
            ) : search.isError ? (
              <div className="px-6 py-10 text-center text-sm text-red-400" role="alert">
                {search.error.message || "Search failed."}
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty className="py-12 text-zinc-500">No matching messages.</CommandEmpty>
            ) : (
              <CommandGroup heading={`${results.length} message${results.length === 1 ? "" : "s"}`}>
                {results.map((result) => {
                  const preview = messagePartsToPlainText(result.message.parts);
                  return (
                    <CommandItem
                      key={result.message.id}
                      value={result.message.id}
                      asChild
                      className="mb-1 rounded-xl px-3 py-3 data-[selected=true]:bg-white/[0.07]"
                    >
                      <Link
                        href={`/chat/${result.thread.id}`}
                        onClick={() => onOpenChange(false)}
                        className="flex min-w-0 items-start gap-3"
                      >
                        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-orange-300/80" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
                            <span className="truncate">{result.thread.title}</span>
                            {result.thread.archived ? (
                              <Archive
                                className="h-3 w-3 shrink-0 text-zinc-600"
                                aria-label="Archived"
                              />
                            ) : null}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-500">
                            {preview || "Tool activity"}
                          </span>
                        </span>
                      </Link>
                    </CommandItem>
                  );
                })}
                {search.hasNextPage ? (
                  <button
                    type="button"
                    disabled={search.isFetchingNextPage}
                    onClick={() => void search.fetchNextPage()}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-xs text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300 disabled:opacity-50"
                  >
                    {search.isFetchingNextPage && (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {search.isFetchingNextPage ? "Loading" : "More results"}
                  </button>
                ) : null}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
