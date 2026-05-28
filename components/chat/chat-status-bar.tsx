"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import type { ChatVisibleStatus } from "@/components/chat/types";

export function ChatStatusBar({ status }: { status: ChatVisibleStatus }) {
  if (status.kind === "idle") return null;

  const isError = status.kind === "error";

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-1 pb-2 text-xs text-zinc-400" role="status">
      {isError ? (
        <AlertCircle className="size-3.5 text-red-300" aria-hidden />
      ) : (
        <Loader2 className="size-3.5 animate-spin text-orange-200 motion-reduce:animate-none" aria-hidden />
      )}
      <span>{status.label}</span>
      {isError && <span className="text-orange-200">{status.retryLabel}</span>}
    </div>
  );
}
