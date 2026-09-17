import { z } from "zod";
import { requiresRuntimeConfig } from "@/lib/env-policy";
import { parseAdminUserIds } from "@/lib/security/admin-policy";
import {
  defaultModelProvider,
  getProviderEnvKey,
  registryProviders,
  type ModelProvider,
} from "@/lib/ai/model-registry";

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

  /**
   * Required unconditionally: memory extraction and the pgvector embeddings
   * both call OpenAI regardless of which chat model a user selects.
   */
  OPENAI_API_KEY: z.string().min(1),
  /**
   * Optional. A deployment without these keys still boots and serves every
   * model whose provider *is* configured; selecting one of the others returns
   * a typed 503 instead of the app refusing to start. See `configuredProviders`.
   */
  GOOGLE_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  POLAR_ACCESS_TOKEN: z.string().min(1),
  POLAR_PRODUCT_ID: z.string().min(1),
  /**
   * Sandbox and production are entirely separate Polar systems with separate
   * tokens and product ids; a token from one returns 401 `invalid_token`
   * against the other. Leaving this unset in production used to silently mean
   * "sandbox", so production credentials were sent to the sandbox API and every
   * checkout failed with a 502 that said nothing useful. It is now required in
   * production and only defaults in development.
   */
  POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),
  /**
   * Required only once a Polar webhook endpoint exists, mirroring how
   * `CLERK_WEBHOOK_SIGNING_SECRET` is treated: until then
   * `/api/webhooks/polar` reports 503 rather than the app refusing to boot.
   *
   * Without it the local subscription mirror is filled only by the one-time
   * cold read, so a plan change takes up to `BILLING_CACHE_TTL_MS` to be seen.
   * That degrades gracefully, which is why it is not required at boot — but a
   * production deployment that wants plan changes to take effect promptly
   * needs it set.
   */
  POLAR_WEBHOOK_SECRET: z.string().min(1).optional(),

  /**
   * Optional. Absent, the `display_products` tool is not offered to the model
   * at all, rather than being offered and failing on every call.
   */
  SERP_API_KEY: z.string().min(1).optional(),

  /**
   * Comma-separated Clerk user ids allowed to read `/admin/*` and
   * `/api/admin/*` — the cost and SLO surfaces. Unset means nobody; see
   * `lib/security/admin-policy.ts` for why that is the safe reading.
   */
  ADMIN_USER_IDS: z.string().optional(),

  /* ─── Observability (all optional; absent means "off", never "broken") ──── */

  /**
   * Where traces go. Setting it is what turns the OpenTelemetry SDK on outside
   * Vercel — on Vercel the platform supplies the exporter and this stays unset.
   * With neither, `withSpan` still runs against the API's no-op tracer, so the
   * instrumentation in the code costs nothing and needs no feature flag.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default("aichatwave"),
  /** The standard OTel kill switch, honored here so an operator can disable tracing without a deploy. */
  OTEL_SDK_DISABLED: z.enum(["true", "false"]).optional(),

  /**
   * Optional webhook the error reporter posts incidents to.
   *
   * Vendor-neutral on purpose: the payload is this app's own shape, and the
   * primary destination for an exception is the active trace span. This is the
   * escape hatch for a deployment with no tracing backend, not the main path.
   */
  ERROR_WEBHOOK_URL: z.url().optional(),

  /**
   * LangSmith. `LANGSMITH_TRACING=true` is what the LangChain SDK itself reads,
   * so it is named exactly that rather than wrapped — but it is declared here
   * so a deployment that turns tracing on without a key fails at boot instead
   * of silently sending nothing.
   */
  LANGSMITH_TRACING: z.enum(["true", "false"]).optional(),
  LANGSMITH_API_KEY: z.string().min(1).optional(),
  LANGSMITH_PROJECT: z.string().min(1).optional(),
  LANGSMITH_ENDPOINT: z.url().optional(),

  NEXT_PUBLIC_APP_URL: z.url().optional(),
  VERCEL_URL: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const envSchemaWithGuards = envSchema.superRefine((value, context) => {
  // Derived from the registry, not restated here: whichever provider the
  // default model uses must be configured, or every chat fails on a deployment
  // that booted cleanly. Other providers may be absent — their models simply
  // become unavailable.
  //
  // Today this resolves to OPENAI_API_KEY, which the base schema already
  // requires, so the check is redundant. It stops being redundant the moment
  // DEFAULT_MODEL_ID moves to another provider — which is exactly when a
  // hand-written check would have been forgotten.
  const defaultProviderKey = getProviderEnvKey(defaultModelProvider());
  if (!value[defaultProviderKey]) {
    context.addIssue({
      code: "custom",
      path: [defaultProviderKey],
      message: `${defaultProviderKey} is required: it is the provider for the default model.`,
    });
  }

  // Tracing on with no key is the worst of both: the SDK builds and queues
  // runs it can never deliver, and the operator believes they have traces.
  if (value.LANGSMITH_TRACING === "true" && value.LANGSMITH_API_KEY === undefined) {
    context.addIssue({
      code: "custom",
      path: ["LANGSMITH_API_KEY"],
      message: "LANGSMITH_API_KEY is required when LANGSMITH_TRACING=true.",
    });
  }

  if (
    !requiresRuntimeConfig({
      nodeEnv: value.NODE_ENV,
      nextPhase: process.env["NEXT_PHASE"],
    })
  ) {
    return;
  }

  if (value.POLAR_SERVER === undefined) {
    context.addIssue({
      code: "custom",
      path: ["POLAR_SERVER"],
      message:
        'POLAR_SERVER must be set explicitly in production ("production" or "sandbox"). ' +
        "Defaulting to sandbox would send production credentials to the sandbox API.",
    });
  }
});

const result = envSchemaWithGuards.safeParse(process.env);

if (!result.success) {
  // Include each issue's message, not just the key: "POLAR_SERVER" alone does
  // not tell an operator what is wrong with it.
  const problems = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment variables — ${problems}`);
}

export const env = result.data;

/** Guaranteed explicit in production by the schema guard above. */
export const polarServer = env.POLAR_SERVER ?? "sandbox";

/**
 * Providers this deployment holds a key for, derived by walking the registry
 * rather than by listing keys — so a new provider cannot be added to
 * `ModelProvider` and silently forgotten here.
 */
export const configuredProviders: ReadonlySet<ModelProvider> = new Set(
  registryProviders().filter((provider) => Boolean(env[getProviderEnvKey(provider)])),
);

/** Whether the SerpAPI-backed `display_products` tool can run at all. */
export const hasSerpApiKey = Boolean(env.SERP_API_KEY);

/** Clerk user ids allowed to read `/admin/*`. Empty set means nobody — see `admin-policy.ts`. */
export const adminUserIds: ReadonlySet<string> = parseAdminUserIds(env.ADMIN_USER_IDS);

export type TracingConfig = {
  readonly enabled: boolean;
  readonly serviceName: string;
  readonly endpoint: string | null;
};

/**
 * Whether to start an OpenTelemetry SDK, and where it should send.
 *
 * Registering an SDK with nowhere to export to costs every request a span it
 * builds, batches, and drops — so the SDK starts only when there is a
 * destination: an OTLP endpoint we were given, or Vercel, which supplies one.
 * The instrumentation in the application code is unconditional either way,
 * because `@opentelemetry/api` resolves to a no-op tracer when no SDK is
 * registered. That is the whole point of instrumenting against the API rather
 * than against an SDK: there is no flag to forget.
 */
export function tracingConfig(): TracingConfig {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null;
  const onVercel = env.VERCEL_URL !== undefined;
  return {
    enabled: env.OTEL_SDK_DISABLED !== "true" && (endpoint !== null || onVercel),
    serviceName: env.OTEL_SERVICE_NAME,
    endpoint,
  };
}

/** LangChain reads `LANGSMITH_TRACING` itself; this is the same answer, for logging and for the health of the config. */
export const langsmithEnabled = env.LANGSMITH_TRACING === "true";

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
