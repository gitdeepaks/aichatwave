"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Brain, Command, Layers, LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MODEL_IDS, MODEL_REGISTRY, getModelPresentation } from "@/lib/ai/model-registry";
import { memoriesApi } from "@/lib/api/client";
import { memoryConsentQueryKey } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * First run: what this thing is, how to pick a model, and the question about
 * memory that was never asked.
 *
 * ## Why it is gated on consent state rather than on a "seen" flag
 *
 * The trigger is the server's `memoryConsent === "undecided"`, not a local
 * "has seen onboarding" boolean. That is deliberate: the tour is the wrapper,
 * the consent is the payload. A local flag would mean a user who cleared their
 * browser gets asked again (harmless) *and* a user who signed in on a second
 * device never gets asked at all (not harmless — it is the difference between
 * asking and assuming).
 *
 * ## Dismissal is not a decision
 *
 * Closing the dialog records nothing. Memory stays off, because `undecided` is
 * enforced as "no" on the server, and the dialog is deferred locally so it does
 * not reappear on every navigation. It comes back on the next session, and the
 * Memory Center carries the same control permanently — so a user who never
 * engages with this dialog is never *stuck* undecided, and is never opted in
 * by silence.
 */

const DEFERRAL_KEY = "aichatwave.onboarding.deferred-until";
/** Long enough not to nag, short enough that the question does get asked. */
const DEFERRAL_MS = 24 * 60 * 60_000;

type Step = "welcome" | "models" | "memory";

const STEP_ORDER: readonly Step[] = ["welcome", "models", "memory"];

export function OnboardingDialog() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("welcome");
  const [isDismissed, setIsDismissed] = useState(false);
  const [isDeferred, setIsDeferred] = useState<boolean | null>(null);

  // Read once on mount rather than during render: `localStorage` is not
  // available on the server, and reading it in the render body is a hydration
  // mismatch waiting to happen. `null` means "not yet known", which keeps the
  // dialog closed for that first frame.
  useEffect(() => {
    setIsDeferred(readDeferral() > Date.now());
  }, []);

  const consent = useQuery({
    queryKey: memoryConsentQueryKey(),
    enabled: isLoaded && isSignedIn && isDeferred === false,
    queryFn: ({ signal }) => memoriesApi.readConsent(signal),
    // The answer changes only when this dialog or the Memory Center changes it,
    // and both invalidate the key. Refetching on window focus would re-open a
    // just-dismissed dialog when the user alt-tabs back.
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const decide = useMutation({
    mutationFn: (decision: "granted" | "declined") => memoriesApi.setConsent(decision),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: memoryConsentQueryKey() });
      setIsDismissed(true);
      toast.success(
        result.state === "granted"
          ? "Long-term memory is on. Manage it any time in the Memory Center."
          : "Long-term memory stays off. You can turn it on in the Memory Center.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isOpen = isDeferred === false && !isDismissed && consent.data?.state === "undecided";

  const close = () => {
    writeDeferral(Date.now() + DEFERRAL_MS);
    setIsDismissed(true);
  };

  const stepIndex = STEP_ORDER.indexOf(step);
  const isLastStep = stepIndex === STEP_ORDER.length - 1;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden border-hairline bg-surface-sunken/95 p-0 shadow-2xl backdrop-blur-2xl">
        <div
          className="pointer-events-none absolute inset-x-12 top-0 h-px brand-rule"
          aria-hidden
        />

        <DialogHeader className="space-y-3 px-7 pb-2 pt-8 text-left">
          <DialogTitle className="text-[22px] font-semibold tracking-[-0.03em] text-fg-bright">
            {STEP_CONTENT[step].title}
          </DialogTitle>
          <DialogDescription className="text-[14px] leading-6 text-fg-muted">
            {STEP_CONTENT[step].description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-7 py-5">{STEP_CONTENT[step].body}</div>

        <DialogFooter className="flex-row items-center justify-between gap-4 border-t border-hairline-subtle px-7 py-5 sm:justify-between">
          <StepDots activeIndex={stepIndex} />

          {isLastStep ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={decide.isPending}
                onClick={() => decide.mutate("declined")}
                className="h-9 rounded-full px-4 text-[13px] text-fg-muted hover:bg-glass hover:text-fg-strong"
              >
                Keep memory off
              </Button>
              <Button
                type="button"
                disabled={decide.isPending}
                onClick={() => decide.mutate("granted")}
                className="h-9 gap-2 rounded-full brand-action px-4 text-sm font-semibold text-fg-on-fill"
              >
                {decide.isPending ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : null}
                Turn memory on
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => setStep(STEP_ORDER[stepIndex + 1] ?? "memory")}
              className="h-9 gap-2 rounded-full bg-glass-strong px-4 text-[13px] font-medium text-fg-strong hover:bg-glass-heavy"
            >
              Next
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STEP_CONTENT: Record<Step, { title: string; description: string; body: ReactNode }> = {
  welcome: {
    title: "Welcome to AIChatWave",
    description:
      "Three things are worth knowing before your first question. This takes about twenty seconds.",
    body: <WelcomeBody />,
  },
  models: {
    title: "Pick the model per question",
    description:
      "The selector in the header changes the model, not the conversation. Switch mid-thread and every earlier turn stays in context.",
    body: <ModelsBody />,
  },
  memory: {
    title: "Long-term memory is yours to switch on",
    description:
      "With it on, the assistant keeps short durable facts about you — a preference, a stack, a constraint — and uses them in later conversations.",
    body: <MemoryBody />,
  },
};

function WelcomeBody() {
  return (
    <ul className="flex flex-col gap-4">
      <OnboardingPoint icon={Layers} title="Every thread is saved">
        Conversations persist, stay searchable and resume after a reload — including an answer that
        was still streaming when you closed the tab.
      </OnboardingPoint>
      <OnboardingPoint icon={Command} title="⌘K is the fast path">
        Jump to a conversation, switch model, or search everything you have ever asked, without
        leaving the keyboard.
      </OnboardingPoint>
      <OnboardingPoint icon={Brain} title="You decide what is remembered">
        The last step of this tour is that decision, and nothing is stored until you make it.
      </OnboardingPoint>
    </ul>
  );
}

/**
 * The model explainer, read from the registry.
 *
 * Deliberately shows the locked models too, with their tier. Explaining the
 * picker while hiding half of what is in it is not an explanation.
 */
function ModelsBody() {
  return (
    <ul className="flex flex-col divide-y divide-hairline-subtle">
      {MODEL_IDS.map((modelId) => {
        const model = getModelPresentation(modelId);
        const isPro = MODEL_REGISTRY[modelId].tier === "subscription";
        return (
          <li key={modelId} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className={cn(
                "mt-1.5 size-1.5 shrink-0 rounded-full",
                isPro ? "bg-fg-faint" : "bg-brand/80",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-[14px] font-medium text-fg-strong">{model.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-fg-faint">
                  {isPro ? "Pro" : "Free"}
                </span>
              </span>
              <span className="mt-0.5 block text-[13px] leading-5 text-fg-subtle">
                {model.blurb}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function MemoryBody() {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2.5">
        <MemoryFact>Only short factual statements — never whole conversations.</MemoryFact>
        <MemoryFact>
          Visible and deletable one at a time from the Memory Center, at any point.
        </MemoryFact>
        <MemoryFact>Never shared between accounts, and removed when you delete yours.</MemoryFact>
        <MemoryFact>Reversible: switching it back off stops both storage and use.</MemoryFact>
      </ul>
      <p className="text-[13px] leading-6 text-fg-faint">
        Leave it off and the assistant still answers normally — it simply starts each conversation
        without knowing you.
      </p>
    </div>
  );
}

function MemoryFact({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-[9px] size-1 shrink-0 rounded-full bg-brand/70" aria-hidden />
      <span className="text-[14px] leading-6 text-fg-soft">{children}</span>
    </li>
  );
}

function OnboardingPoint({
  icon: Icon,
  title,
  children,
}: Readonly<{ icon: typeof Layers; title: string; children: ReactNode }>) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-hairline bg-glass">
        <Icon className="size-4 text-brand-text/85" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-fg-strong">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-5 text-fg-subtle">{children}</span>
      </span>
    </li>
  );
}

function StepDots({ activeIndex }: Readonly<{ activeIndex: number }>) {
  return (
    <p
      className="flex items-center gap-1.5"
      aria-label={`Step ${activeIndex + 1} of ${STEP_ORDER.length}`}
    >
      {STEP_ORDER.map((step, index) => (
        <span
          key={step}
          className={cn(
            "h-1 rounded-full transition-all motion-reduce:transition-none",
            index === activeIndex ? "w-5 bg-brand/85" : "w-1.5 bg-glass-heavy",
          )}
          aria-hidden
        />
      ))}
    </p>
  );
}

/**
 * Deferral, stored per browser.
 *
 * Every access is wrapped: `localStorage` throws outright in a Safari private
 * window and can be blocked by site-data settings, and a thrown storage read
 * inside a render tree takes the whole workspace down. Unreadable storage means
 * "not deferred", which shows the dialog — the safe failure for a consent
 * prompt is asking again, not silently skipping it.
 */
function readDeferral(): number {
  try {
    const raw = window.localStorage.getItem(DEFERRAL_KEY);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeDeferral(until: number): void {
  try {
    window.localStorage.setItem(DEFERRAL_KEY, String(until));
  } catch {
    // Nothing to do: the dialog reappears next session, which is the same
    // outcome as before this feature existed.
  }
}
