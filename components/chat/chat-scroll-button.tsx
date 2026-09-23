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
        "absolute bottom-5 left-1/2 z-20 size-10 -translate-x-1/2 rounded-full border-hairline bg-surface-raised/90 text-fg-strong shadow-elevation-md backdrop-blur-glass-light transition hover:bg-surface-raised motion-reduce:transition-none",
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
