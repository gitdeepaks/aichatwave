"use client";

import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatScrollButton({
  show,
  onClick,
  className,
}: {
  show: boolean;
  onClick: () => void;
  className?: string;
}) {
  if (!show) return null;

  return (
    <Button
      aria-label="Scroll to latest message"
      className={cn(
        "absolute bottom-5 left-1/2 z-20 size-10 -translate-x-1/2 rounded-full border-white/10 bg-zinc-900/90 text-zinc-100 shadow-[0_14px_35px_-16px_rgba(0,0,0,0.9)] backdrop-blur-md transition hover:bg-zinc-800 motion-reduce:transition-none",
        className,
      )}
      onClick={onClick}
      size="icon"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
}
