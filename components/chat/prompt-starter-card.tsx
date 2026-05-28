"use client";

import { cn } from "@/lib/utils";

export function PromptStarterCard({
  category,
  prompt,
  onSelect,
}: {
  category: string;
  prompt: string;
  onSelect: (prompt: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(prompt)}
      className={cn(
        "group rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-orange-300/30 hover:bg-orange-300/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60 motion-reduce:transition-none",
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200/80">
        {category}
      </span>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300 group-hover:text-zinc-100">{prompt}</p>
    </button>
  );
}
