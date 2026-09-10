import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for a thread while its history loads on the server.
 *
 * Mirrors the real transcript's rhythm — alternating sides, uneven widths —
 * so the swap to real content does not shift the layout. Rendered inside the
 * `(chat)` layout, so the sidebar and header are already painted.
 */
export function ChatLoadingSkeleton() {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-hidden px-4 py-8"
      role="status"
      aria-label="Loading conversation"
    >
      <div className="flex flex-1 flex-col justify-end gap-6">
        <MessageSkeleton align="end" widths={["w-2/5"]} />
        <MessageSkeleton align="start" widths={["w-full", "w-11/12", "w-3/4"]} />
        <MessageSkeleton align="end" widths={["w-1/3"]} />
        <MessageSkeleton align="start" widths={["w-full", "w-4/5"]} />
      </div>

      {/* Composer */}
      <Skeleton className="h-24 w-full shrink-0 rounded-2xl bg-white/5" />

      <span className="sr-only">Loading conversation…</span>
    </div>
  );
}

function MessageSkeleton({ align, widths }: { align: "start" | "end"; widths: readonly string[] }) {
  return (
    <div className={`flex flex-col gap-2 ${align === "end" ? "items-end" : "items-start"}`}>
      {widths.map((width, index) => (
        <Skeleton key={index} className={`h-4 ${width} max-w-full bg-white/5`} />
      ))}
    </div>
  );
}
