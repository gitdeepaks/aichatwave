import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";

/**
 * Mirrors `memories/page.tsx`: the header card is real chrome rather than a
 * grey block, so only the part that actually depends on the query — the memory
 * list — reads as pending.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 overflow-hidden p-4"
      role="status"
      aria-label="Loading memories"
    >
      <Card className={cn("shrink-0 rounded-2xl", brandGlassCardClass)}>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40 rounded-full bg-white/5" />
          <Skeleton className="h-6 w-56 bg-white/5" />
          <Skeleton className="h-4 w-full max-w-lg bg-white/5" />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className={cn("rounded-2xl", brandGlassCardClass)}>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-4 w-3/4 bg-white/5" />
              <Skeleton className="h-4 w-1/2 bg-white/5" />
            </CardContent>
          </Card>
        ))}
      </div>

      <span className="sr-only">Loading memories…</span>
    </div>
  );
}
