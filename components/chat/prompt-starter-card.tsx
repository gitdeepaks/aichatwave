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
        "group relative overflow-hidden rounded-2xl border border-hairline bg-glass p-4 text-left shadow-elevation-md transition duration-base hover:-translate-y-0.5 hover:border-brand-text-strong/35 hover:bg-brand-text/[0.08] hover:shadow-glow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      )}
    >
      <span className="brand-rule pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100" />
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-text-strong/80">
        {category}
      </span>
      <p className="mt-2 text-sm leading-relaxed text-fg-soft transition-colors group-hover:text-fg-strong">
        {prompt}
      </p>
    </button>
  );
}
