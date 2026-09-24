"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CreditCard,
  Database,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { messagePartsToPlainText } from "@/lib/ai/message-parts";
import {
  MODEL_IDS,
  getModelPresentation,
  isModelAccessible,
  type ModelId,
} from "@/lib/ai/model-registry";
import { threadsApi } from "@/lib/api/client";
import { isCustomerHaveSubscription } from "@/lib/polar";
import { subscriptionQueryKey, threadSearchQueryKey, threadsQueryKey } from "@/lib/query-keys";
import { markInteractionStart, threadSwitchMark } from "@/lib/perf/client-latency";
import { chatRoute, ROUTES } from "@/lib/routes";
import { useChatStore } from "@/store/chat-store";
import { useCommandPaletteStore } from "@/store/command-palette-store";
import { useAuth } from "@clerk/nextjs";

/**
 * One palette for everything ⌘K used to almost do.
 *
 * Before this, ⌘K opened a dialog that could only search message text. The
 * three things a keyboard user actually wants from a chat app — start a new
 * conversation, jump to a recent one, change model — each needed the mouse.
 * They are all here now, and message search is still here as the thing the
 * query box does once you type into it.
 *
 * ## Why `shouldFilter={false}`
 *
 * cmdk's built-in filter scores every item against the query. Two of the four
 * groups below are *server*-filtered — recent threads and message hits come
 * back already matching — and letting cmdk re-filter them drops rows the
 * server chose to return because the match was in a message body rather than
 * in the title on screen. Filtering is therefore done explicitly, per group,
 * and the two server-backed groups are exempt.
 *
 * ## Why models are listed but locked rather than hidden
 *
 * `isModelAccessible` is the same predicate the chat route enforces with. A
 * locked row that says why is a discoverable upgrade path; a hidden row is a
 * feature the user never learns exists. Selecting one is a no-op with a toast,
 * not a silent nothing — and never a switch that would 403 on the next turn.
 */

const RECENT_THREAD_LIMIT = 7;
const MESSAGE_RESULT_LIMIT = 8;
const SEARCH_DEBOUNCE_MS = 200;
/** Below this, the query is treated as still being typed rather than searched. */
const MIN_SEARCH_LENGTH = 2;

type PaletteAction = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  shortcut?: string;
  run: () => void;
};

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const setOpen = useCommandPaletteStore((state) => state.setOpen);
  const toggle = useCommandPaletteStore((state) => state.toggle);

  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { selectedModel, setSelectedModel } = useChatStore();

  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // The app's global chords, in one listener.
  //
  // Bound on `document` so they fire wherever focus is, including inside the
  // composer's textarea — a shortcut that stops working once you start typing
  // is a shortcut nobody learns. `preventDefault` runs before the handler so
  // the browser's own ⌘K never sees it.
  //
  // ⌘⇧O is advertised on the "New chat" row below, and an advertised shortcut
  // that does nothing is worse than none at all, so it is bound here rather
  // than left as a label.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        toggle();
        return;
      }
      if (key === "o" && event.shiftKey) {
        event.preventDefault();
        setOpen(false);
        router.push(ROUTES.app);
        router.refresh();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router, setOpen, toggle]);

  // A palette that reopens holding the last query is a palette that shows the
  // wrong answers for one frame. Reset on close, not on open, so the clear is
  // not visible.
  useEffect(() => {
    if (!isOpen) {
      setInput("");
      setQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  const { data: hasProPlan = false } = useQuery({
    queryKey: subscriptionQueryKey(userId),
    enabled: isLoaded && isSignedIn,
    queryFn: () => isCustomerHaveSubscription(),
  });

  const threads = useQuery({
    queryKey: threadsQueryKey("active"),
    enabled: isOpen,
    queryFn: ({ signal }) =>
      threadsApi.list({ view: "active", limit: RECENT_THREAD_LIMIT, signal }),
  });

  const isSearching = query.length >= MIN_SEARCH_LENGTH;

  const messages = useQuery({
    queryKey: threadSearchQueryKey(query),
    enabled: isOpen && isSearching,
    queryFn: ({ signal }) => threadsApi.search(query, { limit: MESSAGE_RESULT_LIMIT, signal }),
  });

  const close = () => setOpen(false);

  const go = (path: string) => {
    close();
    router.push(path);
  };

  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: "new-chat",
        label: "New chat",
        hint: "Start a fresh conversation",
        icon: Plus,
        shortcut: "⌘⇧O",
        run: () => {
          // `refresh` and not only `push`: `/app` is `force-dynamic` because it
          // mints a thread id per visit, and navigating to the route you are
          // already on would otherwise reuse the cached segment and its id.
          close();
          router.push(ROUTES.app);
          router.refresh();
        },
      },
      {
        id: "memories",
        label: "Memories",
        hint: "What the assistant remembers about you",
        icon: Database,
        run: () => go(ROUTES.memories),
      },
      {
        id: "profile",
        label: "Profile and plan",
        hint: "Usage, billing, account",
        icon: UserRound,
        run: () => go(ROUTES.profile),
      },
      {
        id: "pricing",
        label: "Plans and pricing",
        hint: "Compare Free and Pro",
        icon: CreditCard,
        run: () => go(ROUTES.pricing),
      },
    ],
    // `go` and `close` close over `router`/`setOpen`, both stable for the
    // component's life; listing them would re-create the array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  const matchingActions = actions.filter((action) => matches(action.label, query));

  const selectModel = (modelId: ModelId) => {
    if (!isModelAccessible(modelId, hasProPlan)) {
      toast.error(`${getModelPresentation(modelId).name} is on the Pro plan.`, {
        action: { label: "See plans", onClick: () => router.push(ROUTES.pricing) },
      });
      return;
    }
    setSelectedModel(modelId);
    close();
    toast.success(`Switched to ${getModelPresentation(modelId).name}.`);
  };

  const openThread = (threadId: string) => {
    // Warm the thread list cache so the sidebar does not flash empty behind the
    // navigation the palette just started.
    void queryClient.invalidateQueries({ queryKey: threadsQueryKey("active") });
    // The palette is the other way into a conversation, so it opens the same
    // timer the sidebar does — a switch measured only when it starts in one of
    // two places is a p95 of half the switches.
    markInteractionStart(threadSwitchMark(threadId));
    go(chatRoute(threadId));
  };

  const recentThreads = (threads.data?.threads ?? []).filter((thread) =>
    query.length === 0 ? true : matches(thread.title, query),
  );
  const messageResults = messages.data?.results ?? [];
  const matchingModels = MODEL_IDS.filter((modelId) =>
    matches(`${getModelPresentation(modelId).name} ${getModelPresentation(modelId).vendor}`, query),
  );

  const isBusy = isSearching && (messages.isLoading || input.trim() !== query);
  const hasAnything =
    matchingActions.length > 0 ||
    recentThreads.length > 0 ||
    matchingModels.length > 0 ||
    messageResults.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden border-hairline bg-surface-sunken/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>
            Jump to a conversation, switch model, or search your message history.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="bg-transparent text-fg-strong" loop>
          <CommandInput
            autoFocus
            value={input}
            onValueChange={setInput}
            placeholder="Search conversations, switch model, run a command..."
            aria-label="Command palette search"
            className="text-fg-strong placeholder:text-fg-faint"
          />
          <CommandList className="max-h-[min(65dvh,32rem)] px-2 py-2">
            {!hasAnything && !isBusy ? (
              <CommandEmpty className="py-12 text-fg-subtle">Nothing matches that.</CommandEmpty>
            ) : null}

            {matchingActions.length > 0 ? (
              <CommandGroup heading="Actions">
                {matchingActions.map((action) => (
                  <PaletteRow
                    key={action.id}
                    value={`action:${action.id}`}
                    icon={action.icon}
                    title={action.label}
                    subtitle={action.hint}
                    onSelect={action.run}
                    {...(action.shortcut === undefined ? {} : { shortcut: action.shortcut })}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {recentThreads.length > 0 ? (
              <>
                {/* Presentational, not a `separator`.

                    `CommandList` is a `role="listbox"`, and ARIA permits it
                    only `option` and `group` children. cmdk's separator
                    renders `role="separator"`, which axe rates a *critical*
                    `aria-required-children` violation — the same class of
                    defect the search-status block below was moved out of the
                    list to avoid. The line is decoration between groups, so it
                    says so and the listbox stays enumerable.

                    Fixed here rather than in `components/ui/command.tsx`:
                    that file is shadcn output and a regeneration would revert
                    it. The props spread reaches the primitive either way. */}
                <CommandSeparator
                  className="my-1 bg-glass"
                  role="presentation"
                  aria-hidden
                />
                <CommandGroup
                  heading={query.length === 0 ? "Recent conversations" : "Conversations"}
                >
                  {recentThreads.map((thread) => (
                    <PaletteRow
                      key={thread.id}
                      value={`thread:${thread.id}`}
                      icon={thread.archived ? Archive : MessageSquareText}
                      title={thread.title}
                      subtitle={formatWhen(thread.lastMessageAt ?? thread.updatedAt)}
                      onSelect={() => openThread(thread.id)}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {matchingModels.length > 0 ? (
              <>
                <CommandSeparator
                  className="my-1 bg-glass"
                  role="presentation"
                  aria-hidden
                />
                <CommandGroup heading="Switch model">
                  {matchingModels.map((modelId) => {
                    const presentation = getModelPresentation(modelId);
                    const locked = !isModelAccessible(modelId, hasProPlan);
                    return (
                      <PaletteRow
                        key={modelId}
                        value={`model:${modelId}`}
                        icon={Sparkles}
                        title={`${presentation.name}`}
                        subtitle={locked ? "Pro plan" : presentation.blurb}
                        onSelect={() => selectModel(modelId)}
                        {...(modelId === selectedModel ? { badge: "Current" } : {})}
                        {...(locked ? { muted: true } : {})}
                      />
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}

            {isSearching && messageResults.length > 0 ? (
              <>
                <CommandSeparator
                  className="my-1 bg-glass"
                  role="presentation"
                  aria-hidden
                />
                <CommandGroup heading="Messages">
                  {messageResults.map((result) => (
                    <PaletteRow
                      key={result.message.id}
                      value={`message:${result.message.id}`}
                      icon={MessageSquareText}
                      title={result.thread.title}
                      subtitle={messagePartsToPlainText(result.message.parts) || "Tool activity"}
                      onSelect={() => openThread(result.thread.id)}
                    />
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>

          {/* Search status lives *outside* `CommandList`, not inside the
              "Messages" group.

              `CommandList` is a `role="listbox"` and `CommandGroup` a
              `role="group"` within it, and ARIA requires their children to be
              options. A spinner, an error line and an empty-state sentence are
              none of those, and axe rates the resulting
              `aria-required-children` a *critical* violation — a listbox whose
              children a screen reader cannot enumerate. Below the list they are
              ordinary text, and `role="status"` announces the search finishing
              without pretending to be a result. */}
          {isSearching && (isBusy || messages.isError || messageResults.length === 0) ? (
            <div className="border-t border-hairline-subtle px-4 py-3">
              {isBusy ? (
                <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
                  <LoaderCircle
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                  Searching your history
                </p>
              ) : messages.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  {messages.error.message || "Search failed."}
                </p>
              ) : (
                <p className="text-sm text-fg-muted" role="status">
                  No messages match that.
                </p>
              )}
            </div>
          ) : null}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteRow({
  value,
  icon: Icon,
  title,
  subtitle,
  shortcut,
  badge,
  muted,
  onSelect,
}: {
  value: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  shortcut?: string;
  badge?: string;
  muted?: boolean;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className="mb-0.5 flex items-start gap-3 rounded-xl px-3 py-2.5 data-[selected=true]:bg-glass-strong"
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${muted === true ? "text-fg-faint" : "text-brand-text/80"}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-fg">
          <span className="truncate">{title}</span>
          {badge === undefined ? null : (
            <span className="shrink-0 rounded-full border border-brand-text/25 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.12em] text-brand-text-strong/80">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-fg-subtle">
          {subtitle}
        </span>
      </span>
      {shortcut === undefined ? null : (
        <CommandShortcut className="text-fg-faint">{shortcut}</CommandShortcut>
      )}
    </CommandItem>
  );
}

/** Case-insensitive substring match. An empty query matches everything. */
function matches(haystack: string, query: string): boolean {
  if (query.length === 0) return true;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

/**
 * `2 hours ago`, `yesterday`, `14 Mar`.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-rolled ladder, and absolute past
 * a week because "43 days ago" is a number nobody converts back into a date.
 */
function formatWhen(iso: string): string {
  const then = new Date(iso);
  const elapsedMs = Date.now() - then.getTime();
  const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

  const minutes = Math.round(elapsedMs / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(-minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(-hours, "hour");

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return relative.format(-days, "day");

  return then.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
