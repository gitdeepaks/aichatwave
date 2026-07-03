import { cn } from "@/lib/utils";

type BrandAtmosphereProps = {
  children: React.ReactNode;
  className?: string;
  /** When true, fills at least the viewport height (good for app shells). */
  fillViewport?: boolean;
};

/**
 * Layered product atmosphere: deep zinc base, warm neural glows, subtle grid and vignette.
 */
export function BrandAtmosphere({ children, className, fillViewport }: BrandAtmosphereProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,#31200f_0%,#09090b_42%,#050505_100%)]",
        fillViewport && "h-dvh min-h-0",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_48%_-16%,rgba(249,115,22,0.34),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_48%_40%_at_102%_28%,rgba(220,38,38,0.18),transparent_56%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_52%_36%_at_-8%_88%,rgba(251,191,36,0.13),transparent_52%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:64px_64px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.035)_34%,transparent_56%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_54%,rgba(0,0,0,0.52)_100%)]"
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
