"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useEffect, useState, type CSSProperties } from "react";

const Toaster = ({ ...props }: ToasterProps) => {
  // next-themes was removed to avoid a React console warning caused by its
  // inline <script> tag. We derive the theme from the class `app/layout.tsx`
  // renders on <html>, falling back to the system preference.
  const getTheme = (): "light" | "dark" => {
    if (typeof document === "undefined") return "dark";
    // A pinned theme is a class on <html>; no class means "follow the system"
    // (see `lib/appearance.ts`).
    if (document.documentElement.classList.contains("dark")) return "dark";
    if (document.documentElement.classList.contains("light")) return "light";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const [theme, setTheme] = useState<"light" | "dark">(() => getTheme());

  useEffect(() => {
    setTheme(getTheme());

    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;

    const onChange = () => setTheme(getTheme());
    mql.addEventListener?.("change", onChange);
    // The appearance menu changes the class in place, with no reload.
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mql.removeEventListener?.("change", onChange);
      observer.disconnect();
    };
  }, []);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
