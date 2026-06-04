import { z } from "zod";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  GOOGLE_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  POLAR_ACCESS_TOKEN: z.string().min(1),
  BETTER_AUTH_URL: z.url().transform(trimTrailingSlash),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
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

export const publicEnv = {
  NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
};
