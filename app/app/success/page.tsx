"use client";

import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";
import { subscriptionQueryKey } from "@/lib/query-keys";
import { ROUTES } from "@/lib/routes";

function SuccessContent() {
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkout_id");
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: subscriptionQueryKey(userId) });
    void refresh();
    // The redirect can beat Polar's webhook. Bound polling to the delivery
    // window so the persistent chat layout does not keep a stale free-plan row.
    const interval = window.setInterval(() => void refresh(), 2_000);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 15_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [queryClient, userId]);

  return (
    <Card className={cn("w-full max-w-110 text-fg-bright", brandGlassCardClass)}>
      <CardHeader className="space-y-5 pt-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-strong/15 ring-1 ring-success/25">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <div className="space-y-2">
          <CardTitle className="text-3xl font-semibold tracking-tight text-fg-bright">
            Payment Successful
          </CardTitle>
          <CardDescription className="mx-auto max-w-80 text-base leading-relaxed text-fg-muted">
            Thank you for upgrading. Your transaction is complete, and your account now has access
            to premium features.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 px-10 pb-2">
        {/* Render the Checkout ID if it exists in the URL */}
        {checkoutId && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-hairline bg-glass p-4 text-center shadow-inner shadow-shade/20">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle">
              Order Reference
            </span>
            <span className="mt-1 w-full max-w-62.5 truncate font-mono text-sm text-fg-strong">
              {checkoutId}
            </span>
          </div>
        )}

        <Link href={ROUTES.app} className="block w-full">
          <Button className="h-13 w-full rounded-xl brand-action text-base font-semibold text-action-foreground shadow-lg shadow-brand-surface/40 transition-[transform,box-shadow] active:scale-[0.98]">
            Return to Chat
            <ArrowRight className="ml-2 size-5" />
          </Button>
        </Link>
      </CardContent>

      <CardFooter className="flex flex-col items-center pb-8 pt-4">
        <div className="text-sm text-fg-subtle">A receipt has been sent to your email.</div>
      </CardFooter>
    </Card>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="flex h-dvh items-center justify-center bg-surface-sunken px-4">
      <Suspense
        fallback={
          <Card
            className={cn(
              "flex h-112.5 w-full max-w-110 items-center justify-center",
              brandGlassCardClass,
            )}
          >
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="size-8 animate-spin text-brand-text" />
              <p className="text-sm text-fg-muted">Verifying payment...</p>
            </div>
          </Card>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
