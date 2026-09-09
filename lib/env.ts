import { z } from "zod";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  // Clerk owns identity. OAuth providers (Google, GitHub) and email/password are
  // configured in the Clerk dashboard, so this app no longer holds provider
  // client secrets of its own.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  /**
   * Required only once a Clerk webhook endpoint exists. Until then the webhook
   * route reports 503 rather than the app refusing to boot.
   */
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  /**
   * Point Clerk at this app's own branded auth screens. Without these, a
   * protected route redirects to Clerk's hosted `*.accounts.dev` portal and the
   * branded shell in `components/auth/auth-screen-shell.tsx` is never seen.
   */
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1).default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1).default("/sign-up"),

  OPENAI_API_KEY: z.string().min(1),
  GOOGLE_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),

  POLAR_ACCESS_TOKEN: z.string().min(1),
  POLAR_PRODUCT_ID: z.string().min(1),
  POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),

  SERP_API_KEY: z.string().min(1),

  NEXT_PUBLIC_APP_URL: z.url().optional(),
  VERCEL_URL: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const invalidKeys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid environment variables: ${invalidKeys}`);
}

export const env = result.data;

export const polarServer = env.POLAR_SERVER ?? "sandbox";

/**
 * Absolute origin of this deployment. Polar checkout and portal redirects need
 * a fully-qualified URL, so this has to resolve on the server too.
 */
export function appUrl(): string {
  const fromEnv = env.NEXT_PUBLIC_APP_URL ?? (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null);
  return trimTrailingSlash(fromEnv ?? "http://localhost:3000");
}

export const publicEnv = {
  NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
};
