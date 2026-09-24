"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { CalendarDays, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { billingApi } from "@/lib/api/client";
import { getCustomerMeters, isCustomerHaveSubscription } from "@/lib/polar";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";
import { subscriptionQueryKey } from "@/lib/query-keys";
import { DeleteAccountCard } from "@/components/profile/delete-account-card";

const profileCardClass = cn("rounded-2xl", brandGlassCardClass);

/** Guards the divide-by-zero that showed `NaN%` on a freshly created account. */
function usagePercent(usage: { consumedUnits: number; creditedUnits: number }): number {
  if (usage.creditedUnits <= 0) return 0;
  return Math.min(100, (usage.consumedUnits / usage.creditedUnits) * 100);
}

export default function ChatbotUserProfile() {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const userId = clerkUser?.id;

  const { data: isProSubscription, isSuccess: isProSubscriptionSuccess } = useQuery({
    queryKey: subscriptionQueryKey(userId),
    queryFn: () => isCustomerHaveSubscription(),
    enabled: isLoaded && isSignedIn,
  });
  const {
    data: usageData,
    isSuccess: isUsageDataSuccess,
    isError,
    error,
  } = useQuery({
    queryKey: ["customer_meters", userId],
    queryFn: () => getCustomerMeters(),
    enabled: isLoaded && isSignedIn,
  });

  if (!isLoaded || !isSignedIn || !clerkUser) {
    return null;
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center text-sm text-danger-text">
        Error: {error?.message ?? "Unable to load profile data."}
      </div>
    );
  }

  const user = {
    name: clerkUser.fullName ?? clerkUser.username ?? "User",
    email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
    image: clerkUser.imageUrl,
  };

  const goToBilling = async (open: () => Promise<string>) => {
    try {
      window.location.href = await open();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Billing is unavailable.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      {/* Profile Header */}
      <Card className={profileCardClass}>
        <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <Avatar className="h-24 w-24 rounded-2xl">
              <AvatarImage src={user?.image ?? ""} alt="" />
              <AvatarFallback className="rounded-2xl text-lg">
                {user.name
                  .split(" ")
                  .map((part: string) => part[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              {/* `h1`: this is the page's title and nothing sits above it, so
                  starting the outline at level 2 leaves the document without
                  one (`page-has-heading-one`). */}
              <h1 className="text-2xl font-semibold tracking-tight text-fg-bright">{user.name}</h1>
              <p className="text-sm text-fg-muted">{user.email}</p>
              <div className="flex items-center gap-3 pt-1">
                <Badge
                  variant="secondary"
                  className="rounded-xl border border-hairline bg-glass text-fg"
                >
                  {"user"}
                </Badge>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 rounded-xl border-hairline text-fg"
                >
                  <ShieldCheck className="h-3 w-3" /> {isProSubscription ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {!isProSubscription && isProSubscriptionSuccess ? (
              <Button
                onClick={() => void goToBilling(billingApi.startProCheckout)}
                className="rounded-xl brand-action font-semibold text-fg-on-fill shadow-lg shadow-brand-surface/40"
              >
                <Sparkles />
                Upgrade to Pro
              </Button>
            ) : (
              <Button className="rounded-xl border border-hairline bg-glass-strong text-[12px] font-medium text-fg-bright hover:bg-glass-heavy">
                <Sparkles />
                Pro Member
              </Button>
            )}

            <Button
              onClick={() => void goToBilling(billingApi.openPortal)}
              variant="outline"
              className="rounded-xl border-hairline bg-glass text-fg-strong hover:bg-glass-strong"
            >
              Manage Billing
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subscription & Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan Details */}
        <Card className={cn(profileCardClass, "lg:col-span-1")}>
          <CardHeader>
            <CardTitle className="text-lg text-fg-bright">Subscription</CardTitle>
            <CardDescription className="text-fg-muted">
              Current plan and renewal details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-muted">Plan</span>
              <Badge className="rounded-xl border border-hairline bg-glass text-fg-strong">
                {isProSubscription ? "AIChatWave Pro" : "Inactive"}
              </Badge>
            </div>

            <Separator />

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-fg-muted">
                  <CalendarDays className="h-4 w-4" /> Purchased
                </div>
                {isUsageDataSuccess && usageData && (
                  <span className="text-fg">
                    {new Date(usageData.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Overview */}
        <Card className={cn(profileCardClass, "lg:col-span-2")}>
          <CardHeader>
            <CardTitle className="text-lg text-fg-bright">Token Usage</CardTitle>
            <CardDescription className="text-fg-muted">
              Monthly AI consumption overview
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isUsageDataSuccess && usageData && (
              <>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="rounded-2xl border border-hairline bg-glass p-4">
                    <div className="flex items-center gap-2 text-sm text-fg-muted">
                      <Zap className="h-4 w-4" /> Monthly Limit
                    </div>
                    <p className="pt-2 text-xl font-semibold text-fg-bright">
                      {usageData.creditedUnits}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-hairline bg-glass p-4">
                    <div className="text-sm text-fg-muted">Current Usage</div>
                    <p className="pt-2 text-xl font-semibold text-fg-bright">
                      {usageData.consumedUnits}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-hairline bg-glass p-4">
                    <div className="text-sm text-fg-muted">Remaining</div>
                    <p className="pt-2 text-xl font-semibold text-fg-bright">{usageData.balance}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* A `role="progressbar"` with no accessible name is announced
                      as an unlabelled percentage and nothing else — axe rates
                      it `serious`. `aria-valuetext` gives the same sentence a
                      sighted user reads below the bar, rather than a bare
                      number. */}
                  <Progress
                    value={usagePercent(usageData)}
                    aria-label="Monthly token quota used"
                    aria-valuetext={`${usagePercent(usageData).toFixed(1)}% of monthly quota used`}
                    className="h-3 rounded-xl"
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-fg-muted">
                      {usagePercent(usageData).toFixed(1)}% of monthly quota used
                    </span>
                    <span className="font-medium text-fg">Resets on Month End</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <DeleteAccountCard />
    </div>
  );
}
