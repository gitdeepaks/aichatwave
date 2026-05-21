"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { CalendarDays, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { getCustomerMeters, isCustomerHaveSubscription } from "@/lib/polar";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";

const profileCardClass = cn("rounded-2xl", brandGlassCardClass);

export default function ChatbotUserProfile() {
  const { data: session, isPending } = authClient.useSession();

  const { data: isProSubscription, isSuccess: isProSubscriptionSuccess } = useQuery({
    queryKey: ["is_customer_have_subscription"],
    queryFn: async () => {
      return isCustomerHaveSubscription(session?.user.id as string);
    },
  });
  const {
    data: usageData,
    isSuccess: isUsageDataSuccess,
    isError,
  } = useQuery({
    queryKey: ["customer_meters"],
    queryFn: async () => {
      return getCustomerMeters(session?.user.id as string);
    },
  });

  if (!session) {
    return <></>;
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center text-sm text-red-300">
        Error: {(isError as unknown as Error)?.message}
      </div>
    );
  }

  const user = session.user;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      {/* Profile Header */}
      <Card className={profileCardClass}>
        <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <Avatar className="h-24 w-24 rounded-2xl">
              <AvatarImage src={user?.image ?? ""} alt={user?.name ?? ""} />
              <AvatarFallback className="rounded-2xl text-lg">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight text-white">{user.name}</h2>
              <p className="text-sm text-zinc-400">{user.email}</p>
              <div className="flex items-center gap-3 pt-1">
                <Badge
                  variant="secondary"
                  className="rounded-xl border border-white/10 bg-white/[0.06] text-zinc-200"
                >
                  {"user"}
                </Badge>
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 rounded-xl border-white/10 text-zinc-200"
                >
                  <ShieldCheck className="h-3 w-3" /> {isProSubscription ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            {!isProSubscription && !isPending && isProSubscriptionSuccess ? (
              <Button
                onClick={async () => {
                  await authClient.checkout({
                    slug: "Pro",
                  });
                }}
                className="rounded-xl bg-gradient-to-r from-orange-500 to-red-600 font-semibold text-white shadow-lg shadow-orange-950/40 hover:from-orange-400 hover:to-red-500"
              >
                <Sparkles />
                Upgrade to Pro
              </Button>
            ) : (
              <Button className="rounded-xl border border-white/10 bg-white/[0.08] text-[12px] font-medium text-white hover:bg-white/[0.12]">
                <Sparkles />
                Pro Member
              </Button>
            )}

            <Button
              onClick={async () => {
                await authClient.customer.portal();
              }}
              variant="outline"
              className="rounded-xl border-white/12 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
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
            <CardTitle className="text-lg text-white">Subscription</CardTitle>
            <CardDescription className="text-zinc-400">
              Current plan and renewal details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Plan</span>
              <Badge className="rounded-xl border border-white/10 bg-white/[0.06] text-zinc-100">
                {isProSubscription ? "AIChatWave Pro" : "Inactive"}
              </Badge>
            </div>

            <Separator />

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-zinc-400">
                  <CalendarDays className="h-4 w-4" /> Purchased
                </div>
                {isUsageDataSuccess && usageData && (
                  <span className="text-zinc-200">
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
            <CardTitle className="text-lg text-white">Token Usage</CardTitle>
            <CardDescription className="text-zinc-400">
              Monthly AI consumption overview
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isUsageDataSuccess && usageData && (
              <>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Zap className="h-4 w-4" /> Monthly Limit
                    </div>
                    <p className="pt-2 text-xl font-semibold text-white">{usageData.creditedUnits}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-sm text-zinc-400">Current Usage</div>
                    <p className="pt-2 text-xl font-semibold text-white">{usageData.consumedUnits}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="text-sm text-zinc-400">Remaining</div>
                    <p className="pt-2 text-xl font-semibold text-white">{usageData.balance}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Progress
                    value={(usageData.consumedUnits / usageData.creditedUnits) * 100}
                    className="h-3 rounded-xl"
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">
                      {((usageData.consumedUnits / usageData.creditedUnits) * 100).toFixed(1)}% of
                      monthly quota used
                    </span>
                    <span className="font-medium text-zinc-200">Resets on Month End</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
