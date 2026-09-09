import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your account · AIChatWave",
  description: "Start building with an AI workspace that remembers your context.",
};

export default function SignUpPage() {
  return <SignUp />;
}
