"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Memory } from "./page";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";

function Records({ memories }: { memories: Memory[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((m) => (m.content ?? "").toLowerCase().includes(q));
  }, [memories, search]);

  return (
    <Card className={cn("rounded-2xl", brandGlassCardClass)}>
      <CardHeader className="flex flex-col gap-4 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-lg text-white">
            Memory Records ({memories.length})
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400">
            Structured contextual entries stored by the AI system
          </CardDescription>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-white/10 bg-white/[0.04] pl-9 text-zinc-100 shadow-inner shadow-black/20 placeholder:text-zinc-500 focus-visible:border-orange-400/50 focus-visible:ring-orange-500/25"
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea className="pr-4">
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-zinc-500">
                No matching memories found.
              </div>
            )}

            {filtered.map((memory, index) => (
              <div
                key={memory.id}
                className="px-4 py-4 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="rounded-md text-xs capitalize"
                      >
                        {index}
                      </Badge>
                      <h3 className="font-medium text-md">{memory.content}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {memory.id}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                    <Clock className="h-3 w-3" />
                    {new Date(memory.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default Records;

