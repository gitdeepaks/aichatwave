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
            products: ["c00cd16b-c7f1-460b-804a-6b8a2c015154"],
            slug: "Pro",
          });
        }}
        variant="default"
        className="rounded-full bg-[#373669] border-[#3e3e4a] text-white hover:bg-[#373669]/60 text-[12px] h-8 px-4 font-medium"
      >
        ✦ Get Pro
      </Button>
    </div>
  );
}
