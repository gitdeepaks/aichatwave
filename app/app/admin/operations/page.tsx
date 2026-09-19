import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Activity, AlertTriangle, DollarSign, Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { brandGlassCardClass } from "@/components/brand/brand-atmosphere";
import { cn } from "@/lib/utils";
import type {
  CostByDayDto,
  CostByModelDto,
  CostByUserDto,
  CostReportResponse,
  SloEvaluationDto,
  SloReportResponse,
} from "@/lib/api/contracts";
import { getSessionUserId } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/admin";
import { buildCostReport } from "@/server/observability/cost-service";
import { buildSloReport } from "@/server/observability/slo-service";

export const metadata: Metadata = { title: "Operations" };

const COST_WINDOW_DAYS = 30;
const SLO_WINDOW_MINUTES = 60;

/**
 * The operations dashboard: what the product is spending, and whether it is
 * meeting the objectives written down in `lib/observability/slo.ts`.
 *
 * Deliberately dynamic. Everything on this page is a live number, and a
 * cached spend figure is a figure that cannot answer the question it exists
 * for ("did something change *today*?").
 */
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  // Awaited before the panels, so a non-admin is refused before any query
  // runs rather than inside a Suspense boundary that has already started
  // streaming.
  //
  // It does **not** make the response a 404, and browser testing is what
  // established that: this page renders inside the `(chat)` layout, so Next
  // has committed a 200 and a full app shell before `notFound()` is reached.
  // A URL that genuinely does not exist answers 404 in ~28 KB; this answers
  // 200 in ~98 KB. The route is therefore discoverable by anyone measuring
  // status codes — which is acceptable, because the path is in the repo and in
  // `.env.example` anyway. What is *not* discoverable is who is an admin and
  // what the page holds: a non-admin sees the ordinary not-found screen and no
  // cost or SLO data reaches the response at all. That is the property worth
  // having, and it is the one that is verified.
  await requireAdminOrNotFound();

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 overflow-y-auto p-4">
      <Header />
      <Suspense fallback={<PanelFallback label="Loading service objectives" rows={2} />}>
        <SloPanel />
      </Suspense>
      <Suspense fallback={<PanelFallback label="Loading cost report" rows={4} />}>
        <CostPanel />
      </Suspense>
    </div>
  );
}

/**
 * The gate. A non-admin gets `notFound()` rather than a redirect or a 403, for
 * the same reason `requireAdminUserId` throws a typed 404: a page listing
 * every user's spend should not confirm that it exists.
 *
 * Called from the page body *and* from each panel. The first call is what sets
 * the status code; the repeats are what actually protect the data, since a
 * panel is the thing that reads it. Both are cheap — Clerk's session lookup is
 * memoized per request.
 */
async function requireAdminOrNotFound(): Promise<void> {
  const userId = await getSessionUserId();
  if (!isAdmin(userId)) notFound();
}

async function SloPanel() {
  await requireAdminOrNotFound();
  const report = await buildSloReport({ windowMinutes: SLO_WINDOW_MINUTES });

  return (
    <section className="flex flex-col gap-3" aria-label="Service level objectives">
      <SectionHeading
        icon={<Gauge className="h-4 w-4 text-orange-300" aria-hidden />}
        title="Service objectives"
        detail={`Last ${String(report.windowMinutes)} minutes${report.paging ? " · paging" : ""}`}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {report.objectives.map((objective) => (
          <SloCard key={objective.id} objective={objective} />
        ))}
      </div>
      <InstanceScopeNote report={report} />
    </section>
  );
}

function SloCard({ objective }: { objective: SloEvaluationDto }) {
  return (
    <Card className={cn("rounded-2xl", brandGlassCardClass)}>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-zinc-200">{objective.title}</span>
          <StatusPill status={objective.status} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-white">
            {formatSloValue(objective)}
          </span>
          <span className="text-xs text-zinc-500">
            target {formatMeasure(objective.unit, objective.objective)} · page at{" "}
            {formatMeasure(objective.unit, objective.pageAt)}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          {objective.sample.toLocaleString("en-US")} observations ·{" "}
          {objective.scope === "fleet" ? "all instances" : "this instance only"}
        </p>
        {objective.status === "healthy" || objective.status === "insufficient_data" ? null : (
          <p className="text-xs leading-relaxed text-amber-200/80">{objective.runbook}</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Said out loud, on the page, rather than left in a comment nobody reading the
 * dashboard will see: two of these numbers describe one container.
 */
function InstanceScopeNote({ report }: { report: SloReportResponse }) {
  const instanceScoped = report.objectives.filter((objective) => objective.scope === "instance");
  if (instanceScoped.length === 0) return null;

  return (
    <p className="text-xs leading-relaxed text-zinc-500">
      {instanceScoped.map((objective) => objective.title).join(" and ")} are counted in this
      process&apos;s memory — nothing durable records an HTTP response or a usage ingest — so on a
      multi-instance deployment they describe whichever instance served this page, and they reset on
      a cold start.
    </p>
  );
}

async function CostPanel() {
  await requireAdminOrNotFound();
  const report = await buildCostReport({ windowDays: COST_WINDOW_DAYS });

  return (
    <section className="flex flex-col gap-3" aria-label="Cost">
      <SectionHeading
        icon={<DollarSign className="h-4 w-4 text-orange-300" aria-hidden />}
        title="Spend"
        detail={`Last ${String(report.windowDays)} days · list prices`}
      />

      <Card className={cn("rounded-2xl", brandGlassCardClass)}>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Metric label="Cost" value={formatUsd(report.totals.costUsd)} />
          <Metric
            label="Assistant messages"
            value={report.totals.messages.toLocaleString("en-US")}
          />
          <Metric
            label="Tokens"
            value={(report.totals.inputTokens + report.totals.outputTokens).toLocaleString("en-US")}
          />
        </CardContent>
      </Card>

      {report.truncated ? (
        <p className="flex items-center gap-2 text-xs text-amber-200/80">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          The row cap was reached — these totals are a floor, not a total.
        </p>
      ) : null}

      <ModelTable models={report.byModel} />
      <UserTable users={report.topUsers} />
      <DayTable days={report.byDay} />
      <p className="text-xs leading-relaxed text-zinc-500">
        Costs are provider list prices from the model registry, applied to the token counts
        persisted on each message. They are not an invoice: discounts, cached-input rates and batch
        pricing are not modelled, and Polar remains the billing record.
      </p>
    </section>
  );
}

function ModelTable({ models }: { models: CostByModelDto[] }) {
  if (models.length === 0) return <EmptyRow label="No model usage in this window." />;

  return (
    <DataCard title="By model">
      {models.map((model) => (
        <Row
          key={model.modelId}
          label={model.modelId}
          sublabel={
            model.priced
              ? `${model.messages.toLocaleString("en-US")} messages`
              : `${model.messages.toLocaleString("en-US")} messages · not in the registry, no price`
          }
          value={formatUsd(model.costUsd)}
        />
      ))}
    </DataCard>
  );
}

function UserTable({ users }: { users: CostByUserDto[] }) {
  if (users.length === 0) return <EmptyRow label="No per-user spend in this window." />;

  return (
    <DataCard title="By user">
      {users.map((user) => (
        <Row
          key={user.userId}
          label={user.userId}
          sublabel={`${formatUsd(user.todayUsd)} today · ${user.messages.toLocaleString("en-US")} messages`}
          value={formatUsd(user.costUsd)}
          badge={
            user.anomaly.anomalous ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                <Activity className="h-3 w-3" aria-hidden />
                {user.anomaly.ratio === null
                  ? "anomaly"
                  : `${user.anomaly.ratio.toFixed(1)}x baseline`}
              </span>
            ) : null
          }
        />
      ))}
    </DataCard>
  );
}

function DayTable({ days }: { days: CostByDayDto[] }) {
  if (days.length === 0) return null;

  return (
    <DataCard title="By day">
      {days.map((day) => (
        <Row
          key={day.day}
          label={day.day}
          sublabel={`${day.messages.toLocaleString("en-US")} messages`}
          value={formatUsd(day.costUsd)}
        />
      ))}
    </DataCard>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <Card className={cn("rounded-2xl", brandGlassCardClass)}>
      <CardContent>
        <p className="text-sm text-zinc-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function DataCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className={cn("rounded-2xl", brandGlassCardClass)}>
      <CardContent className="flex flex-col gap-1">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
          {title}
        </h3>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  sublabel,
  value,
  badge,
}: {
  label: string;
  sublabel: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/5 py-2 first:border-t-0">
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 truncate text-sm text-zinc-200">
          {label}
          {badge}
        </span>
        <span className="truncate text-xs text-zinc-500">{sublabel}</span>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums text-white">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-white">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: SloEvaluationDto["status"] }) {
  const tone =
    status === "paging"
      ? "border-red-400/30 bg-red-400/10 text-red-200"
      : status === "degraded"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : status === "healthy"
          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
          : "border-white/10 bg-white/[0.06] text-zinc-400";

  const label = status === "insufficient_data" ? "not enough data" : status.replace("_", " ");

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function SectionHeading({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
      </div>
      <span className="text-xs text-zinc-500">{detail}</span>
    </div>
  );
}

function Header() {
  return (
    <Card className={cn("shrink-0 rounded-2xl", brandGlassCardClass)}>
      <CardContent>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
          <Gauge className="size-3 text-orange-300" aria-hidden />
          Operations
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Cost and reliability</h1>
        <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
          What the product is spending, and how it is standing against its service objectives.
          Visible only to the user ids in <code className="text-zinc-300">ADMIN_USER_IDS</code>.
        </p>
      </CardContent>
    </Card>
  );
}

function PanelFallback({ label, rows }: { label: string; rows: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => index).map((index) => (
        <Card key={index} className={cn("rounded-2xl", brandGlassCardClass)}>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-1/3 bg-white/5" />
            <Skeleton className="h-4 w-2/3 bg-white/5" />
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function formatUsd(value: number | null): string {
  if (value === null) return "—";
  // Sub-cent spend is normal here and rounding it to $0.00 makes a whole
  // column read as zero, so small figures keep four decimals.
  const fractionDigits = value > 0 && value < 0.01 ? 4 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatSloValue(objective: SloEvaluationDto): string {
  if (objective.value === null) return "—";
  return formatMeasure(objective.unit, objective.value);
}

function formatMeasure(unit: SloEvaluationDto["unit"], value: number): string {
  if (unit === "milliseconds") {
    return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value).toString()}ms`;
  }
  return `${(value * 100).toFixed(2)}%`;
}
