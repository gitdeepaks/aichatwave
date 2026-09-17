/**
 * Phase H exit-criteria verification, against the live database and the real
 * process environment.
 *
 * The unit tests cover the pure parts — the incident classifier, the retry and
 * breaker arithmetic, the fallback routing, the anomaly detector, the SLO
 * bands. What they cannot cover is whether the observability configuration
 * this deployment actually holds is coherent, whether the cost query runs
 * against the real schema, and whether the SLO queries can read the column
 * Phase H added. Those are deployment facts and they are checked here.
 *
 * Usage: pnpm phase-h:verify
 */

import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
import { adminUserIds, configuredProviders, env, langsmithEnabled, tracingConfig } from "@/lib/env";
import {
  fallbackModelId,
  MODEL_IDS,
  MODEL_REGISTRY,
  registryProviders,
} from "@/lib/ai/model-registry";
import { SLO_IDS, SLOS } from "@/lib/observability/slo";
import { buildCostReport } from "@/server/observability/cost-service";
import { buildSloReport } from "@/server/observability/slo-service";
import { langsmithStatus } from "@/server/observability/langsmith";
import { healthyProviders, providerBreakerStatus } from "@/server/ai/provider-health";
import { createLogger, type LogEntry } from "@/server/lib/logger";

function report(label: string, detail: string): void {
  console.log(`  ${label.padEnd(34)} ${detail}`);
}

/**
 * The tracing configuration, stated rather than assumed.
 *
 * Not an assertion that tracing is on: a development machine legitimately has
 * no collector, and the point of instrumenting against the OpenTelemetry API
 * is that the app behaves identically either way. What is asserted is that the
 * configuration is *coherent* — an endpoint that is set is usable, and the
 * kill switch is not silently defeating an endpoint someone configured.
 */
function verifyTracingConfig(): void {
  const config = tracingConfig();

  report("OTel service name", config.serviceName);
  report("OTel exporter endpoint", config.endpoint ?? "unset");
  report("OTel SDK", config.enabled ? "will start" : "will not start (no exporter)");

  if (config.endpoint !== null) {
    assert.doesNotThrow(
      () => new URL(config.endpoint ?? ""),
      "OTEL_EXPORTER_OTLP_ENDPOINT must be a URL",
    );
  }

  if (env.OTEL_SDK_DISABLED === "true" && config.endpoint !== null) {
    console.warn(
      "  ⚠ OTEL_SDK_DISABLED=true is overriding a configured OTEL_EXPORTER_OTLP_ENDPOINT.",
    );
  }
}

/** Tracing on without a key is caught at boot; this reports what is actually set. */
function verifyLangsmithConfig(): void {
  const status = langsmithStatus();

  report("LangSmith tracing", status.enabled ? "on" : "off");
  report("LangSmith project", status.project ?? "default");

  assert.equal(status.enabled, langsmithEnabled, "langsmithStatus and langsmithEnabled must agree");
  if (status.enabled) {
    assert.ok(env.LANGSMITH_API_KEY !== undefined, "LANGSMITH_TRACING=true needs an API key");
    console.warn(
      "  ⚠ LangSmith tracing is ON: prompts, tool calls and responses leave this deployment.",
    );
  }
}

/** Reports whether errors have anywhere to go besides the log. */
function verifyErrorReporting(): void {
  report("Incident webhook", env.ERROR_WEBHOOK_URL ?? "unset (span + log only)");
  if (env.ERROR_WEBHOOK_URL !== undefined) {
    assert.doesNotThrow(() => new URL(env.ERROR_WEBHOOK_URL ?? ""));
  }
}

/**
 * The exit criterion: a provider outage degrades to a fallback rather than a
 * 500 — where one exists. Where one does not, that is stated, because a
 * deployment holding only OpenAI keys has no fallback at all and an operator
 * should know that before the outage rather than during it.
 */
function verifyFallbackCoverage(): void {
  const providers = registryProviders();
  const covered: string[] = [];
  const uncovered: string[] = [];

  for (const modelId of MODEL_IDS) {
    const failing = MODEL_REGISTRY[modelId].provider;
    const healthy = new Set(providers.filter((provider) => provider !== failing));
    const fallback = fallbackModelId({ modelId, available: configuredProviders, healthy });

    if (fallback === null) uncovered.push(modelId);
    else covered.push(`${modelId} → ${fallback}`);
  }

  report("Providers configured", [...configuredProviders].join(", ") || "none");
  for (const line of covered) report("Fallback", line);
  for (const modelId of uncovered) {
    console.warn(`  ⚠ ${modelId} has no fallback on this deployment — its outage fails the turn.`);
  }

  // Every breaker starts closed, so nothing is being routed around at rest.
  for (const provider of providers) {
    assert.equal(
      providerBreakerStatus(provider),
      "closed",
      `${provider} breaker should start closed`,
    );
  }
  assert.equal(healthyProviders(providers).size, providers.length);
}

/** The admin surface fails closed, and says so either way. */
function verifyAdminAllowlist(): void {
  report(
    "Admin user ids",
    adminUserIds.size === 0 ? "none — dashboard closed" : String(adminUserIds.size),
  );
  for (const userId of adminUserIds) {
    assert.ok(userId.length > 0, "an empty admin id would match an empty user id");
  }
}

/** The cost query has to run against the real schema, not just typecheck. */
async function verifyCostReport(): Promise<void> {
  const report30 = await buildCostReport({ windowDays: 30 });

  assert.equal(report30.windowDays, 30);
  assert.ok(Number.isFinite(Date.parse(report30.generatedAt)));

  const dayTotal = report30.byDay.reduce((sum, day) => sum + (day.costUsd ?? 0), 0);
  const modelTotal = report30.byModel.reduce((sum, model) => sum + (model.costUsd ?? 0), 0);
  // The same tokens, folded three ways: the views must agree, or the dashboard
  // is showing three different answers to one question.
  assert.ok(
    Math.abs(dayTotal - modelTotal) < 1e-6,
    `by-day (${String(dayTotal)}) and by-model (${String(modelTotal)}) totals disagree`,
  );

  report("Cost window", `${String(report30.windowDays)} days`);
  report("Messages priced", report30.totals.messages.toLocaleString("en-US"));
  report(
    "Spend (list price)",
    report30.totals.costUsd === null ? "partly unpriced" : `$${report30.totals.costUsd.toFixed(4)}`,
  );
  report(
    "Users flagged",
    String(report30.topUsers.filter((user) => user.anomaly.anomalous).length),
  );
}

/**
 * The SLO queries have to read `chat_stream.first_token_at`, which Phase H
 * added — so this fails loudly on a database that has not been migrated.
 */
async function verifySloReport(): Promise<void> {
  const entries: LogEntry[] = [];
  const log = createLogger({}, (entry) => entries.push(entry));

  const report60 = await buildSloReport({ windowMinutes: 60, log });

  assert.equal(report60.objectives.length, SLO_IDS.length, "every objective must be measured");
  for (const objective of report60.objectives) {
    assert.ok(objective.id in SLOS, `${objective.id} is not a declared SLO`);
    assert.ok(objective.runbook.length > 0, `${objective.id} must carry its runbook`);
    report(
      objective.title,
      objective.value === null
        ? `not enough data (${String(objective.sample)} observations)`
        : `${objective.value.toFixed(objective.unit === "ratio" ? 4 : 0)} · ${objective.status} · ${objective.scope}`,
    );
  }

  // A breach must reach a human, not just a dashboard.
  const breaches = report60.objectives.filter((objective) => objective.status === "paging");
  assert.equal(
    entries.filter((entry) => entry.message === "slo.breached").length,
    breaches.length,
    "every paging objective must emit slo.breached",
  );
}

/** Proves the migration landed, which every SLO latency number depends on. */
async function verifyFirstTokenColumn(pool: Pool): Promise<void> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count
       from information_schema.columns
      where table_name = 'chat_stream' and column_name = 'first_token_at'`,
  );
  assert.equal(
    result.rows[0]?.count,
    1,
    "chat_stream.first_token_at is missing — run pnpm migration:migrate",
  );
  report("chat_stream.first_token_at", "present");
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    console.log("\nConfiguration");
    verifyTracingConfig();
    verifyLangsmithConfig();
    verifyErrorReporting();
    verifyAdminAllowlist();

    console.log("\nResilience");
    verifyFallbackCoverage();

    console.log("\nSchema");
    await verifyFirstTokenColumn(pool);

    console.log("\nCost");
    await verifyCostReport();

    console.log("\nService objectives");
    await verifySloReport();

    console.log(
      "\nPhase H verification passed: tracing and LangSmith configuration are coherent, " +
        "provider fallback coverage is known, the first-token column exists, the cost views " +
        "agree, and every objective is measured with breaches alerting.\n",
    );
  } finally {
    await pool.end();
  }
}

void main();
