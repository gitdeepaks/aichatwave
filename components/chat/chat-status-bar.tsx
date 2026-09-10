"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import type { ChatVisibleStatus } from "@/components/chat/types";

export function ChatStatusBar({
  status,
  onRetry,
}: {
  status: ChatVisibleStatus;
  onRetry?: () => void;
}) {
  if (status.kind === "idle") return null;

  const isError = status.kind === "error";

  return (
    <div
      className="mx-auto flex w-full max-w-3xl items-center gap-2 px-1 pb-2 text-xs text-zinc-400"
      role="status"
    >
      {isError ? (
        <AlertCircle className="size-3.5 text-red-300" aria-hidden />
      ) : (
        <Loader2
          className="size-3.5 animate-spin text-orange-200 motion-reduce:animate-none"
          aria-hidden
        />
      )}
      <span>{status.label}</span>
      {isError && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full px-2 py-0.5 text-orange-200 transition hover:bg-orange-300/10 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/50 motion-reduce:transition-none"
        >
          {status.retryLabel}
        </button>
      )}
    </div>
  );
}
