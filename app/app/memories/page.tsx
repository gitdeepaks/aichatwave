import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Database, Sparkles } from "lucide-react";
import Records from "./records";
import { getSessionUserId } from "@/server/auth/session";
import { listMemories } from "@/server/memory/memory-service";
import { toMemoryDto } from "@/server/api/dto";
import { redirect } from "next/navigation";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ROUTES } from "@/lib/routes";
import { MemoryConsentCard } from "@/components/memory/memory-consent-card";

export const metadata: Metadata = { title: "Memory Center" };

export default function UserMemoriesPanel() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 overflow-hidden p-4">
      <MemoryHeader />
      <MemoryConsentCard />
      <Suspense fallback={<MemoryRecordsFallback />}>
        <MemoryRecords />
      </Suspense>
    </div>
  );
}

async function MemoryRecords() {
  const userId = await getSessionUserId();

  if (!userId) {
    redirect(ROUTES.signIn);
  }

  const memories = (await listMemories(userId)).map(toMemoryDto);

  return <Records memories={memories} />;
}

function MemoryHeader() {
  return (
    <Card className={cn("shrink-0 rounded-2xl", brandGlassCardClass)}>
      <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-glass px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-fg-muted">
            <Sparkles className="size-3 text-brand-text" aria-hidden />
            Long-term memory
          </div>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-text" />
            {/* `h1`, not `h2`. This is the page's own title — there is no
                heading above it — and axe's `page-has-heading-one` flags a
                document whose outline starts at level 2. */}
            <h1 className="text-xl font-semibold tracking-tight text-fg-bright">Memory Center</h1>
          </div>
          <p className="mt-1 max-w-lg text-base leading-relaxed text-fg-muted">
            Facts and preferences the assistant keeps across chats. You decide whether it keeps any,
            and every one of them can be deleted individually.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function MemoryRecordsFallback() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading memories">
      {[0, 1, 2, 3].map((index) => (
        <Card key={index} className={cn("rounded-2xl", brandGlassCardClass)}>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-3/4 bg-glass" />
            <Skeleton className="h-4 w-1/2 bg-glass" />
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Loading memories...</span>
    </div>
  );
}
