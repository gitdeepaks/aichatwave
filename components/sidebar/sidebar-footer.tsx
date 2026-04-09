"use client";

import { BadgeCheck, Bell, ChevronsUpDown, CreditCard, LogOut, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { isCustomerHaveSubscription } from "@/lib/polar";
import { Skeleton } from "../ui/skeleton";
import { Spinner } from "../ui/spinner";
import Link from "next/link";

export function SidebarFooterComponent() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  // Avoid hydration mismatch: session is only available on client after fetch
  useEffect(() => setMounted(true), []);

  const user =
    mounted && session?.user
      ? {
          name: session.user.name ?? "User",
          email: session.user.email ?? "",
          image: session.user.image ?? BRAND_LOGO_SRC,
        }
      : null;

  const [hasProSubscription, setHasProSubscription] = useState<boolean | null>(null);

  useEffect(() => {
    const userId = session?.user.id;
    if (!mounted || !userId || isPending) {
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
  }, [mounted, session?.user.id, isPending]);

  const showProMemberCta = hasProSubscription === false;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {mounted && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                {isPending ? (
                  <div className="h-8! w-8! text-muted-foreground flex justify-center items-center">
                    <Spinner />
                  </div>
                ) : (
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.image} alt={user.name} />
                    <AvatarFallback>
                      <Skeleton className="h-full w-full rounded-full" />
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.image} alt={user.name} />
                    <AvatarFallback>
                      <Skeleton className="h-full w-full rounded-full" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {showProMemberCta ? (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuItem className="bg-[#373669] border-[#3e3e4a] text-white !hover:bg-[#373669]/60 text-[12px] font-medium">
                      <Sparkles />
                      Pro Member
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <Link href="/profile" className="flex items-center gap-2">
                    <BadgeCheck />
                    Account
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await authClient.customer.portal();
                  }}
                >
                  <CreditCard />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await router.push("/profile");
                  }}
                >
                  <Bell />
                  Notifications
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/auth/signin");
                }}
              >
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
