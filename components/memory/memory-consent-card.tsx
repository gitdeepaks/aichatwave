"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { memoriesApi } from "@/lib/api/client";
import type { MemoryConsentResponse } from "@/lib/api/contracts";
import { memoryConsentQueryKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * The permanent home of the memory decision.
 *
 * The onboarding dialog asks once; this is where the answer can be changed,
 * and where a user who dismissed that dialog finds the question again. Consent
 * that can only be given, never withdrawn, is not consent — so the control has
 * to live somewhere stable, next to the data it governs.
 *
 * Turning memory **off** deliberately leaves existing memories in place and
 * says so. Deleting them silently would destroy data the user never asked to
 * lose; hiding them would leave data they can no longer reach. They stay
 * listed below this card, individually deletable, and unused.
 */
export function MemoryConsentCard() {
  const queryClient = useQueryClient();

  const consent = useQuery({
    queryKey: memoryConsentQueryKey(),
    queryFn: ({ signal }) => memoriesApi.readConsent(signal),
  });

  const decide = useMutation({
    mutationFn: (decision: "granted" | "declined") => memoriesApi.setConsent(decision),
    onSuccess: (result) => {
      queryClient.setQueryData<MemoryConsentResponse>(memoryConsentQueryKey(), result);
      toast.success(
        result.state === "granted"
          ? "Long-term memory is on."
          : "Long-term memory is off. Nothing new will be stored.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const state = consent.data?.state;
  const isOn = state === "granted";

  return (
    <Card className={cn("shrink-0 rounded-2xl", brandGlassCardClass)}>
      <CardContent className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-glass">
            <Brain className="size-5 text-brand-text/85" aria-hidden />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {/* `h2`: the page's `h1` is "Memory Center", so this is the next
                  level down and skipping to `h3` would break the outline. */}
              <h2 className="text-[15px] font-medium text-fg-bright">Long-term memory</h2>
              {consent.isPending ? (
                <Skeleton className="h-5 w-20 rounded-full bg-glass" />
              ) : (
                <StatusPill state={state ?? "undecided"} />
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-[13px] leading-6 text-fg-muted">
              {isOn
                ? "The assistant may store short durable facts from your messages and use them in later conversations. Delete any of them below."
                : "Nothing is being stored. The assistant starts each conversation without prior knowledge of you."}
            </p>
            {isOn ? null : (
              <p className="mt-1 text-[12px] leading-5 text-fg-muted">
                Memories already saved stay listed below and are not used while this is off.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            disabled={consent.isPending || decide.isPending}
            onClick={() => decide.mutate(isOn ? "declined" : "granted")}
            className={cn(
              "h-9 gap-2 rounded-full px-4 text-[13px] font-semibold",
              isOn
                ? "border border-hairline bg-glass text-fg hover:bg-glass-strong"
                : "brand-action text-fg-on-fill",
            )}
          >
            {decide.isPending ? (
              <LoaderCircle
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : null}
            {isOn ? "Turn memory off" : "Turn memory on"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ state }: Readonly<{ state: "undecided" | "granted" | "declined" }>) {
  const label = state === "granted" ? "On" : state === "declined" ? "Off" : "Not set";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]",
        state === "granted"
          ? "border-brand-text/30 text-brand-text-strong/90"
          : "border-hairline text-fg-muted",
      )}
    >
      <ShieldCheck className="size-3" aria-hidden />
      {label}
    </span>
  );
}
