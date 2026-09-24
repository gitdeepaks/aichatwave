"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { billingApi } from "@/lib/api/client";
import { isCustomerHaveSubscription } from "@/lib/polar";
import { subscriptionQueryKey } from "@/lib/query-keys";

/** Header CTA: opens Polar checkout when the user has no active Pro subscription. */
export function ProUpgradeCta() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [isStarting, setIsStarting] = useState(false);

  const { data: hasProSubscription } = useQuery({
    queryKey: subscriptionQueryKey(userId),
    enabled: isLoaded && isSignedIn,
    queryFn: () => isCustomerHaveSubscription(),
  });

  if (!isLoaded || !isSignedIn || hasProSubscription !== false) {
    return null;
  }

  const startCheckout = async () => {
    setIsStarting(true);
    try {
      window.location.href = await billingApi.startProCheckout();
    } catch (error) {
      setIsStarting(false);
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
    }
  };

  return (
    <div className="absolute left-1/2 -translate-x-1/2">
      <Button
        onClick={() => void startCheckout()}
        disabled={isStarting}
        variant="default"
        className="h-8 rounded-full border border-hairline brand-action px-4 text-xs font-semibold text-fg-on-fill shadow-lg shadow-brand-surface/40 transition-[transform,box-shadow] hover:shadow-danger-surface/30 active:scale-[0.98] disabled:opacity-60"
      >
        ✦ Get Pro
      </Button>
    </div>
  );
}
