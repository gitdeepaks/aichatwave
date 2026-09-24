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
        "relative w-full overflow-hidden atmosphere-ground",
        fillViewport && "h-dvh min-h-0",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_48%_-16%,var(--bloom-ember),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_48%_40%_at_102%_28%,var(--bloom-crimson),transparent_56%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_52%_36%_at_-8%_88%,var(--bloom-amber),transparent_52%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,var(--hairline-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--glass-fill)_1px,transparent_1px)] [background-size:64px_64px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,var(--glass-fill)_34%,transparent_56%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_54%,var(--vignette)_100%)]"
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
  "border border-hairline bg-surface-raised/75 text-fg-bright shadow-elevation-lg backdrop-blur-glass-heavy supports-[backdrop-filter]:bg-surface-raised/55";
