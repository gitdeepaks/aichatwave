import type { ReactNode } from "react";
import { AuthScreenShell } from "@/components/auth/auth-screen-shell";

export default function SignUpLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthScreenShell
      eyebrow="Create your account"
      headline="Build with an AI that remembers."
      panelHint="Create an account in a single step — no setup required."
      tagline="Threads, long-term memory, and tool-powered answers from your very first message."
    >
      {children}
    </AuthScreenShell>
  );
}
