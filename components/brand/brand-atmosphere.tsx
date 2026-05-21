import { cn } from "@/lib/utils";

type BrandAtmosphereProps = {
  children: React.ReactNode;
  className?: string;
  /** When true, fills at least the viewport height (good for app shells). */
  fillViewport?: boolean;
};

/**
 * Same layered background as auth (sign in / sign up): zinc-950 base, warm radial glows, subtle grid.
 */
export function BrandAtmosphere({ children, className, fillViewport }: BrandAtmosphereProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-zinc-950",
        fillViewport && "h-dvh min-h-0",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-15%,rgba(249,115,22,0.26),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_100%_30%,rgba(239,68,68,0.14),transparent_50%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_0%_85%,rgba(251,146,60,0.1),transparent_45%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:48px_48px]"
        aria-hidden
      />
      <div
        className={cn(
          "relative z-10 flex w-full flex-col",
          fillViewport ? "h-full min-h-0 overflow-hidden" : "min-h-0 flex-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Glass card shell matching auth cards (sign in / sign up). */
export const brandGlassCardClass =
  "border border-white/10 bg-zinc-900/75 text-zinc-50 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-12px_rgba(0,0,0,0.65)] backdrop-blur-2xl supports-[backdrop-filter]:bg-zinc-900/55";
