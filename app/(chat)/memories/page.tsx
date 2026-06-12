import { Card, CardContent } from "@/components/ui/card";
import { Database, Sparkles } from "lucide-react";
import Records from "./records";
import { getSessionUserId } from "@/server/auth/session";
import { listMemories } from "@/server/memory/memory-service";
import { redirect } from "next/navigation";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";

export default async function UserMemoriesPanel() {
  const userId = await getSessionUserId();

  if (!userId) {
    redirect("/auth/signin");
  }

  const memories = await listMemories(userId);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 overflow-hidden p-4">
      <Card className={cn("shrink-0 rounded-2xl", brandGlassCardClass)}>
        <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
              <Sparkles className="size-3 text-orange-300" aria-hidden />
              Long-term memory
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-orange-300" />
              <h2 className="text-xl font-semibold tracking-tight text-white">Memory Center</h2>
            </div>
            <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-zinc-400">
              Facts and preferences the assistant keeps across chats — same glass look as your
              sign-in experience.
            </p>
          </div>
        </CardContent>
      </Card>

      <Records memories={memories} />
    </div>
  );
}
