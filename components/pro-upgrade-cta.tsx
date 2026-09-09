"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { billingApi } from "@/lib/api/client";
import { isCustomerHaveSubscription } from "@/lib/polar";

/** Header CTA: opens Polar checkout when the user has no active Pro subscription. */
export function ProUpgradeCta() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [isStarting, setIsStarting] = useState(false);

  const { data: hasProSubscription } = useQuery({
    queryKey: ["customer_subscription", userId],
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
        onClick={startCheckout}
        disabled={isStarting}
        variant="default"
        className="h-8 rounded-full border border-white/10 bg-gradient-to-r from-orange-500 to-red-600 px-4 text-[12px] font-semibold text-white shadow-lg shadow-orange-950/40 transition-[transform,box-shadow] hover:from-orange-400 hover:to-red-500 hover:shadow-red-950/30 active:scale-[0.98] disabled:opacity-60"
      >
        ✦ Get Pro
      </Button>
    </div>
  );
}
