"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Bell, ChevronsUpDown, CreditCard, LogOut, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { billingApi } from "@/lib/api/client";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { isCustomerHaveSubscription } from "@/lib/polar";
import { Skeleton } from "../ui/skeleton";
import Link from "next/link";

export function SidebarFooterComponent() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { signOut } = useClerk();
  // `isLoaded` already guards against rendering before the user is known, so the
  // previous mounted-flag dance is no longer needed to avoid a hydration mismatch.
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();

  const user =
    isLoaded && isSignedIn && clerkUser
      ? {
          name: clerkUser.fullName ?? clerkUser.username ?? "User",
          email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
          image: clerkUser.imageUrl.length > 0 ? clerkUser.imageUrl : BRAND_LOGO_SRC,
        }
      : null;

  const { data: hasProSubscription } = useQuery({
    queryKey: ["customer_subscription", clerkUser?.id],
    enabled: isLoaded && isSignedIn,
    queryFn: () => isCustomerHaveSubscription(),
  });

  const showProMemberCta = hasProSubscription === false;

  const openBillingPortal = async () => {
    try {
      window.location.href = await billingApi.openPortal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open billing.");
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
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
                <DropdownMenuItem onClick={openBillingPortal}>
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
                  await signOut({ redirectUrl: "/sign-in" });
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
