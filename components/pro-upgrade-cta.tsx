"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { isCustomerHaveSubscription } from "@/lib/polar";
import { useEffect, useState } from "react";

/** Header CTA: opens Polar checkout when the user has no active Pro subscription. */
export function ProUpgradeCta() {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [hasProSubscription, setHasProSubscription] = useState<boolean | null>(null);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || isSessionPending) {
      setHasProSubscription(null);
      return;
    }

    let cancelled = false;
    setHasProSubscription(null);

    void isCustomerHaveSubscription(userId).then((active) => {
      if (!cancelled) setHasProSubscription(active);
    });

    return () => {
      cancelled = true;
    };
  }, [session?.user.id, isSessionPending]);

  const showUpgrade =
    !isSessionPending && Boolean(session?.user.id) && hasProSubscription === false;

  if (!showUpgrade) {
    return null;
  }

  return (
    <div className="absolute left-1/2 -translate-x-1/2">
      <Button
        onClick={async () => {
          await authClient.checkout({
            slug: "Pro",
          });
        }}
        variant="default"
        className="h-8 rounded-full border border-white/10 bg-gradient-to-r from-orange-500 to-red-600 px-4 text-[12px] font-semibold text-white shadow-lg shadow-orange-950/40 transition-[transform,box-shadow] hover:from-orange-400 hover:to-red-500 hover:shadow-red-950/30 active:scale-[0.98]"
      >
        ✦ Get Pro
      </Button>
    </div>
  );
}
