import type { ReactNode } from "react";
import { AuthScreenShell } from "@/components/auth/auth-screen-shell";

export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthScreenShell
      eyebrow="Welcome back"
      headline="Return to your AI workspace."
      panelHint="Choose a provider to continue to your workspace."
      tagline="Pick up every thread, context, and build plan exactly where you left it."
    >
      {children}
    </AuthScreenShell>
  );
}
