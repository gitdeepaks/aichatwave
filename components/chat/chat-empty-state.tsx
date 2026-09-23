"use client";

import { Blocks, Compass, Sparkles, Zap } from "lucide-react";
import { PromptStarterCard } from "@/components/chat/prompt-starter-card";

const PROMPT_STARTERS = [
  { category: "Code", prompt: "Review this component for bugs, edge cases, and UX friction." },
  {
    category: "Research",
    prompt: "Compare the best privacy-first analytics stacks for a SaaS app.",
  },
  { category: "Products", prompt: "Find and compare compact creator desk upgrades under $300." },
  { category: "Market", prompt: "Give me a concise market update on AI infrastructure companies." },
  { category: "Planning", prompt: "Turn this product idea into a 7-day execution plan." },
] satisfies { category: string; prompt: string }[];

export function ChatEmptyState({ onPromptSelect }: { onPromptSelect: (prompt: string) => void }) {
  return (
    <div className="mb-8 flex w-full max-w-4xl flex-col items-center text-center">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-text-strong/20 bg-brand-text/[0.08] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-text-bright/85 shadow-glow-md backdrop-blur-glass-light">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-text opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-brand-text-strong" />
        </span>
        Live multimodal workspace
      </div>
      <div className="mb-5 grid grid-cols-3 gap-2 text-brand-text-bright/70" aria-hidden>
        <Sparkles className="size-4" />
        <Zap className="size-4" />
        <Compass className="size-4" />
      </div>
      <h1 className="brand-headline max-w-3xl text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
        Think, build, and ship without leaving the conversation.
      </h1>
      <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-fg-muted sm:text-base">
        A faster, calmer AI workspace for code review, product decisions, research, and execution.
        Ask naturally, keep context visible, and move from thought to output with less interface
        drag.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-xs text-fg-subtle">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-glass px-3 py-1.5">
          <Blocks className="size-3 text-brand-text-strong/80" aria-hidden />
          code aware
        </span>
        <span className="rounded-full border border-hairline bg-glass px-3 py-1.5">
          research ready
        </span>
        <span className="rounded-full border border-hairline bg-glass px-3 py-1.5">
          voice input
        </span>
      </div>
      <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROMPT_STARTERS.map((starter) => (
          <PromptStarterCard
            key={starter.category}
            category={starter.category}
            prompt={starter.prompt}
            onSelect={onPromptSelect}
          />
        ))}
      </div>
    </div>
  );
}
