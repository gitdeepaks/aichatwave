"use client";

import { Sparkles } from "lucide-react";
import { PromptStarterCard } from "@/components/chat/prompt-starter-card";

const PROMPT_STARTERS = [
  { category: "Code", prompt: "Review this component for bugs and edge cases." },
  { category: "Research", prompt: "Compare the best options for a privacy-first analytics stack." },
  { category: "Products", prompt: "Find and compare products for a compact creator desk setup." },
  { category: "Market", prompt: "Give me a concise market update on AI infrastructure companies." },
  { category: "Planning", prompt: "Turn this idea into a 7-day execution plan." },
] satisfies { category: string; prompt: string }[];

export function ChatEmptyState({ onPromptSelect }: { onPromptSelect: (prompt: string) => void }) {
  return (
    <div className="mb-8 flex w-full max-w-3xl flex-col items-center text-center">
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-orange-300/15 bg-orange-300/[0.08] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-orange-100/80 shadow-[0_10px_30px_-20px_rgba(251,146,60,0.8)]">
        <Sparkles className="size-3 text-orange-300" aria-hidden />
        AIChatWave
      </div>
      <h1 className="text-balance bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
        What can I help you build?
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-zinc-400">
        Code, research, products, and planning with a chat surface that stays out of your way.
      </p>
      <div className="mt-7 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
