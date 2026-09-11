"use client";

import { AlertCircle, Loader2, Sparkles, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { billingApi } from "@/lib/api/client";
import { formatRetryDelay } from "@/lib/api/chat-error";
import type { ChatVisibleStatus } from "@/components/chat/types";

const actionClass =
  "rounded-full px-2 py-0.5 text-orange-200 transition hover:bg-orange-300/10 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/50 disabled:opacity-50 motion-reduce:transition-none";

export function ChatStatusBar({
  status,
  onRetry,
}: {
  status: ChatVisibleStatus;
  onRetry?: () => void;
}) {
  if (status.kind === "idle") return null;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl items-center gap-2 px-1 pb-2 text-xs text-zinc-400"
      role="status"
    >
      {renderIcon(status)}
      <span>{status.label}</span>
      {renderAction(status, onRetry)}
    </div>
  );
}

/** Exhaustive over `ChatVisibleStatus`, so a new variant is a compile error. */
function renderIcon(status: ChatVisibleStatus) {
  switch (status.kind) {
    case "idle":
      return null;
    case "error":
      return <AlertCircle className="size-3.5 text-red-300" aria-hidden />;
    case "quota-exceeded":
      return <Sparkles className="size-3.5 text-orange-300" aria-hidden />;
    case "rate-limited":
      return <TimerReset className="size-3.5 text-amber-300" aria-hidden />;
    case "submitted":
    case "streaming":
    case "tool-running":
      return (
        <Loader2
          className="size-3.5 animate-spin text-orange-200 motion-reduce:animate-none"
          aria-hidden
        />
      );
  }
}

function renderAction(status: ChatVisibleStatus, onRetry: (() => void) | undefined) {
  switch (status.kind) {
    case "error":
      return onRetry ? (
        <button type="button" onClick={onRetry} className={actionClass}>
          {status.retryLabel}
        </button>
      ) : null;

    case "rate-limited":
      return (
        <RateLimitAction
          retryLabel={status.retryLabel}
          retryAfterSeconds={status.retryAfterSeconds}
          {...(onRetry === undefined ? {} : { onRetry })}
        />
      );

    case "quota-exceeded":
      return <UpgradeAction label={status.upgradeLabel} />;

    case "idle":
    case "submitted":
    case "streaming":
    case "tool-running":
      return null;
  }
}

/**
 * Counts the wait down and only then offers the retry.
 *
 * The server already said how long to wait, so letting the user retry before
 * then would spend their click on a guaranteed second 429 — and, because a
 * rejected request is not counted, teach them the limit is arbitrary. Showing
 * the clock is the honest version of "slow down".
 */
function RateLimitAction({
  retryLabel,
  retryAfterSeconds,
  onRetry,
}: {
  retryLabel: string;
  retryAfterSeconds: number | null;
  onRetry?: () => void;
}) {
  const [remaining, setRemaining] = useState(retryAfterSeconds ?? 0);

  useEffect(() => {
    setRemaining(retryAfterSeconds ?? 0);
    if (retryAfterSeconds === null) return;

    const timer = setInterval(() => {
      setRemaining((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [retryAfterSeconds]);

  if (!onRetry) return null;

  if (remaining > 0) {
    return (
      <span className="rounded-full px-2 py-0.5 tabular-nums text-zinc-500">
        retry in {formatRetryDelay(remaining)}
      </span>
    );
  }

  return (
    <button type="button" onClick={onRetry} className={actionClass}>
      {retryLabel}
    </button>
  );
}

/**
 * The upgrade path, offered at the moment the limit is actually felt.
 *
 * Uses the same server-minted checkout URL as the header CTA and the profile
 * page — the product and plan are chosen on the server, never by the client.
 */
function UpgradeAction({ label }: { label: string }) {
  const [isStarting, setIsStarting] = useState(false);

  const startCheckout = async () => {
    setIsStarting(true);
    try {
      window.location.href = await billingApi.startProCheckout();
    } catch (error) {
      setIsStarting(false);
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void startCheckout()}
      disabled={isStarting}
      className={actionClass}
    >
      {label}
    </button>
  );
}
