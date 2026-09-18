/**
 * Coverage gates, per area rather than as one average.
 *
 * A single global threshold is the thing to avoid here: `server/` and `lib/`
 * hold the auth checks, the ownership rules, the limiter and the billing
 * mirror, and a global number lets a well-covered area pay for a badly covered
 * one. Each area is therefore gated on its own, and the report names the files
 * dragging an area down so a failure is actionable rather than a number to
 * argue with.
 *
 * Reads the lcov `pnpm test:coverage` writes. Node's own
 * `--test-coverage-lines` family would be simpler, but it only knows one
 * global figure across everything `--test-coverage-include` selected.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/server/lib/logger";

const log = logger.child({ script: "check-coverage" });

const LCOV_PATH = "coverage/lcov.info";

export type Thresholds = { lines: number; branches: number; functions: number };

/**
 * Set a couple of points under where each area stands today, so the gate is a
 * ratchet against regression rather than a target nobody can meet. Raise them
 * when the real number moves; never lower one to make a build pass.
 *
 * The two areas are held to different numbers because they are different
 * kinds of code, not because one matters less. `lib/` is nearly all pure
 * functions over values, and anything under ~95% there means something is
 * genuinely untested. `server/` reaches providers, the OpenTelemetry SDK and
 * Polar, and some of its branches exist for failures a test cannot honestly
 * stage, so the same number there would be a target met by writing tests that
 * assert nothing.
 *
 * Measured at: server 80.50 / 83.19 / 75.64, lib 96.71 / 90.29 / 90.00.
 */
export const THRESHOLDS: Record<string, Thresholds> = {
  server: { lines: 78, branches: 80, functions: 72 },
  lib: { lines: 94, branches: 88, functions: 87 },
};

type FileCoverage = {
  file: string;
  linesFound: number;
  linesHit: number;
  branchesFound: number;
  branchesHit: number;
  functionsFound: number;
  functionsHit: number;
};

/**
 * Parses the subset of lcov that carries the totals.
 *
 * `SF:` opens a record and `end_of_record` closes it; the `*F`/`*H` pairs are
 * found/hit for lines, branches and functions. Everything else — the per-line
 * `DA:` detail — is summarized by those, so it is skipped.
 */
export function parseLcov(source: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  let current: FileCoverage | null = null;

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("SF:")) {
      current = {
        file: line.slice("SF:".length),
        linesFound: 0,
        linesHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
      };
      continue;
    }

    if (current === null) continue;

    if (line === "end_of_record") {
      files.push(current);
      current = null;
      continue;
    }

    const [key, value] = line.split(":");
    const count = Number(value);
    if (key === undefined || !Number.isFinite(count)) continue;

    if (key === "LF") current.linesFound = count;
    else if (key === "LH") current.linesHit = count;
    else if (key === "BRF") current.branchesFound = count;
    else if (key === "BRH") current.branchesHit = count;
    else if (key === "FNF") current.functionsFound = count;
    else if (key === "FNH") current.functionsHit = count;
  }

  return files;
}

/** The top-level directory a covered file belongs to, relative to the repo root. */
function areaOf(file: string): string | null {
  const relative = path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;
  const [area] = relative.split(path.sep);
  return area !== undefined && area in THRESHOLDS ? area : null;
}

function percent(hit: number, found: number): number {
  return found === 0 ? 100 : (hit / found) * 100;
}

function format(value: number): string {
  return `${value.toFixed(2)}%`;
}

export type AreaSummary = {
  area: string;
  lines: number;
  branches: number;
  functions: number;
  files: FileCoverage[];
};

export function summarize(files: FileCoverage[]): AreaSummary[] {
  const byArea = new Map<string, FileCoverage[]>();

  for (const file of files) {
    const area = areaOf(file.file);
    if (area === null) continue;
    byArea.set(area, [...(byArea.get(area) ?? []), file]);
  }

  return [...byArea.entries()].map(([area, areaFiles]) => {
    const total = areaFiles.reduce(
      (running, file) => ({
        linesFound: running.linesFound + file.linesFound,
        linesHit: running.linesHit + file.linesHit,
        branchesFound: running.branchesFound + file.branchesFound,
        branchesHit: running.branchesHit + file.branchesHit,
        functionsFound: running.functionsFound + file.functionsFound,
        functionsHit: running.functionsHit + file.functionsHit,
      }),
      {
        linesFound: 0,
        linesHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
      },
    );

    return {
      area,
      lines: percent(total.linesHit, total.linesFound),
      branches: percent(total.branchesHit, total.branchesFound),
      functions: percent(total.functionsHit, total.functionsFound),
      files: areaFiles,
    };
  });
}

/** The least-covered files in an area, so a failure points somewhere. */
function worstFiles(summary: AreaSummary, count: number): string[] {
  return [...summary.files]
    .filter((file) => file.linesFound > 0)
    .sort(
      (left, right) =>
        percent(left.linesHit, left.linesFound) - percent(right.linesHit, right.linesFound),
    )
    .slice(0, count)
    .map((file) => {
      const relative = path.relative(process.cwd(), file.file);
      return `${relative} (${format(percent(file.linesHit, file.linesFound))} lines)`;
    });
}

async function main(): Promise<void> {
  let source: string;

  try {
    source = await readFile(LCOV_PATH, "utf8");
  } catch {
    log.error("coverage.report_missing", { path: LCOV_PATH });
    process.exitCode = 1;
    return;
  }

  const summaries = summarize(parseLcov(source));
  const failures: string[] = [];

  for (const [area, thresholds] of Object.entries(THRESHOLDS)) {
    const summary = summaries.find((candidate) => candidate.area === area);

    if (summary === undefined) {
      log.error("coverage.area_missing", { area });
      failures.push(area);
      continue;
    }

    const shortfalls = [
      summary.lines < thresholds.lines
        ? `lines ${format(summary.lines)} < ${thresholds.lines}%`
        : null,
      summary.branches < thresholds.branches
        ? `branches ${format(summary.branches)} < ${thresholds.branches}%`
        : null,
      summary.functions < thresholds.functions
        ? `functions ${format(summary.functions)} < ${thresholds.functions}%`
        : null,
    ].filter((entry) => entry !== null);

    log.info("coverage.area", {
      area,
      files: summary.files.length,
      lines: format(summary.lines),
      branches: format(summary.branches),
      functions: format(summary.functions),
      passed: shortfalls.length === 0,
    });

    if (shortfalls.length > 0) {
      failures.push(area);
      log.error("coverage.below_threshold", {
        area,
        shortfalls: shortfalls.join("; "),
        leastCovered: worstFiles(summary, 5).join(", "),
      });
    }
  }

  if (failures.length > 0) {
    log.error("coverage.failed", { areas: failures.join(", ") });
    process.exitCode = 1;
    return;
  }

  log.info("coverage.passed", { areas: Object.keys(THRESHOLDS).join(", ") });
}

main().catch((error: unknown) => {
  log.error("script.failed", {}, error);
  process.exitCode = 1;
});
