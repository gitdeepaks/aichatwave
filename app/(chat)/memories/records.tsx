"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { memoriesApi } from "@/lib/api/client";
import type { MemoryDto } from "@/lib/api/contracts";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";

const MEMORIES_QUERY_KEY = ["memories"] as const;

const memoryDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

function Records({ memories: initialMemories }: { memories: MemoryDto[] }) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  // Seeded from the server render, then owned by the query cache so a deletion
  // updates the list without a full page reload.
  const { data: memories = initialMemories } = useQuery({
    queryKey: MEMORIES_QUERY_KEY,
    queryFn: () => memoriesApi.list(),
    initialData: initialMemories,
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: string) => memoriesApi.remove(memoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MEMORIES_QUERY_KEY });
      toast.success("Memory forgotten");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((m) => m.content.toLowerCase().includes(q));
  }, [memories, search]);

  return (
    <Card
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl",
        brandGlassCardClass,
      )}
    >
      <CardHeader className="shrink-0 flex flex-col gap-4 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-lg text-white">Memory Records ({memories.length})</CardTitle>
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

      <CardContent className="min-h-0 flex-1 overflow-hidden pt-0">
        <ScrollArea className="h-full min-h-0 pr-4">
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-zinc-500">
                No matching memories found.
              </div>
            )}

            {filtered.map((memory, index) => (
              <div key={memory.id} className="px-4 py-4 transition-colors hover:bg-white/[0.04]">
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-1 max-w-3xl">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-md text-xs capitalize">
                        {index}
                      </Badge>
                      <h3 className="font-medium text-md">{memory.content}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{memory.id}</p>
                  </div>

                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {memoryDateFormatter.format(new Date(memory.createdAt))}
                    </span>
                    <button
                      type="button"
                      aria-label={`Forget memory: ${memory.content}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(memory.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
