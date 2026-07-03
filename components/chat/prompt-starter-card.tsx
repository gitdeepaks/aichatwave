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
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left shadow-[0_18px_48px_-36px_rgba(0,0,0,0.9)] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200/35 hover:bg-orange-300/[0.08] hover:shadow-[0_24px_60px_-34px_rgba(251,146,60,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/35 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200/80">
        {category}
      </span>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300 transition-colors group-hover:text-zinc-100">
        {prompt}
      </p>
    </button>
  );
}
