"use client";

import { Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  panelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/marketing/marketing-shell";
import { billingApi } from "@/lib/api/client";
import { formatPlanInterval, formatPlanPrice, type PlanCard } from "@/lib/marketing/plans";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The two plan cards, with the call to action each visitor should actually see.
 *
 * Three states, not two:
 *
 *  - **Signed out** → sign-up. Sending a stranger to a checkout they cannot
 *    complete without an account is a redirect loop with extra steps.
 *  - **Signed in, Free card** → open the workspace. They already have it.
 *  - **Signed in, Pro card** → a real Polar checkout, minted by the server.
 *
 * `isSignedIn` arrives as a prop, resolved by the page from `auth()`, rather
 * than being read here with `useAuth()`. The page is server-rendered per
 * request anyway, so the server already knows — and the hook version renders
 * the signed-out call to action first and swaps it a beat later, which on the
 * one page where the button matters is exactly the wrong place for a flicker.
 * Clerk's `<Show>` is not an option inside this component: it is an async
 * server component, and the upgrade button below needs client state.
 *
 * The client never chooses the product or the price: it asks
 * `POST /api/billing/checkout` for a URL and navigates. That is the same call
 * the in-app upgrade buttons make, which is why this component is a new
 * surface and not a second billing path.
 */
export function PlanCards({
  plans,
  isSignedIn,
}: Readonly<{ plans: readonly [PlanCard, PlanCard]; isSignedIn: boolean }>) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {plans.map((plan) => (
        <PlanColumn key={plan.id} plan={plan} isSignedIn={isSignedIn} />
      ))}
    </div>
  );
}

function PlanColumn({ plan, isSignedIn }: Readonly<{ plan: PlanCard; isSignedIn: boolean }>) {
  return (
    <section
      aria-labelledby={`plan-${plan.id}`}
      className={cn(
        panelClass,
        "relative flex flex-col gap-7 overflow-hidden p-7 sm:p-9",
        plan.featured && "border-brand-text/20",
      )}
    >
      {plan.featured ? (
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,var(--bloom-ember-soft),transparent_68%)]"
          aria-hidden
        />
      ) : null}

      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2
            id={`plan-${plan.id}`}
            className="text-sm font-medium uppercase tracking-[0.22em] text-fg-soft"
          >
            {plan.name}
          </h2>
          {plan.featured ? (
            <span className="rounded-full border border-brand-text/25 px-2.5 py-0.5 font-mono text-2xs uppercase tracking-[0.18em] text-brand-text-strong/85">
              Everything
            </span>
          ) : null}
        </div>

        <PriceLine plan={plan} />

        <p className="max-w-[40ch] text-sm leading-6 text-fg-muted">{plan.tagline}</p>
      </div>

      <div className="relative">
        <PlanAction plan={plan} isSignedIn={isSignedIn} />
      </div>

      <ul className="relative flex flex-col gap-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="mt-[3px] size-4 shrink-0 text-brand-text/80" aria-hidden />
            <span className="text-sm leading-6 text-fg-soft">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="relative">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-fg-muted">Models</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {plan.models.map((model) => (
            <li key={model.id} className="flex items-baseline gap-2.5">
              <span className="text-sm font-medium text-fg">{model.name}</span>
              <span className="font-mono text-2xs uppercase tracking-[0.16em] text-fg-muted">
                {model.vendor}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PriceLine({ plan }: Readonly<{ plan: PlanCard }>) {
  if (plan.price === null) {
    // Polar could not be read. Saying so beats inventing a number, and the
    // checkout button below still works — it gets its price from Polar too.
    return (
      <p className="text-3xl font-semibold leading-none tracking-[-0.03em] text-fg-bright">
        See price at checkout
      </p>
    );
  }

  return (
    <p className="flex items-baseline gap-2">
      <span className="text-5xl font-semibold leading-none tracking-[-0.045em] text-fg-bright">
        {formatPlanPrice(plan.price)}
      </span>
      <span className="text-sm text-fg-muted">{formatPlanInterval(plan.price)}</span>
    </p>
  );
}

function PlanAction({ plan, isSignedIn }: Readonly<{ plan: PlanCard; isSignedIn: boolean }>) {
  const buttonClass = cn(plan.featured ? primaryButtonClass : secondaryButtonClass, "w-full");

  if (!isSignedIn) {
    return (
      <Link href={ROUTES.signUp} className={buttonClass}>
        {plan.featured ? "Start free, upgrade anytime" : "Start free"}
      </Link>
    );
  }

  if (!plan.featured) {
    return (
      <Link href={ROUTES.app} className={buttonClass}>
        Open workspace
      </Link>
    );
  }

  return <UpgradeButton className={buttonClass} />;
}

function UpgradeButton({ className }: Readonly<{ className: string }>) {
  const [isStarting, setIsStarting] = useState(false);

  const startCheckout = async () => {
    setIsStarting(true);
    try {
      window.location.href = await billingApi.startProCheckout();
    } catch (error) {
      // Only reset on failure: on success the navigation is already underway,
      // and re-enabling the button invites a second checkout session.
      setIsStarting(false);
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void startCheckout()}
      disabled={isStarting}
      className={cn(className, "disabled:opacity-60")}
    >
      {isStarting ? (
        <>
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Opening checkout
        </>
      ) : (
        "Upgrade to Pro"
      )}
    </button>
  );
}
