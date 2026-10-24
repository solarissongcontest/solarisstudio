import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assessV3CapacityRehearsalPlan } from "../src/lib/v3-capacity-rehearsal-plan";

type CliOptions = {
  planPath: string;
  expectedSha: string;
  outputPath: string | null;
  requireReady: boolean;
};

function fail(message: string): never {
  console.error(`[v3-s12-capacity-plan] FAIL: ${message}`);
  process.exit(1);
}

function valueAfter(args: readonly string[], index: number, flag: string) {
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith("--")) {
    fail(`${flag} requires a value`);
  }
  return value;
}

export function parseV3CapacityRehearsalPlanArgs(
  args: readonly string[],
): CliOptions {
  let planPath: string | null = null;
  let expectedSha: string | null = null;
  let outputPath: string | null = null;
  let requireReady = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--plan":
        planPath = valueAfter(args, index, arg);
        index += 1;
        break;
      case "--expected-sha":
        expectedSha = valueAfter(args, index, arg);
        index += 1;
        break;
      case "--output":
        outputPath = valueAfter(args, index, arg);
        index += 1;
        break;
      case "--require-ready":
        requireReady = true;
        break;
      default:
        fail(`unknown argument ${arg ?? "<missing>"}`);
    }
  }

  if (!planPath || !expectedSha) {
    fail(
      "usage: bun scripts/check-v3-capacity-rehearsal-plan.ts --plan <plan.json> --expected-sha <40-char-sha> [--output <assessment.json>] [--require-ready]",
    );
  }

  return { planPath, expectedSha, outputPath, requireReady };
}

export function readV3CapacityRehearsalPlan(path: string): unknown {
  const absolute = resolve(process.cwd(), path);
  try {
    return JSON.parse(readFileSync(absolute, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read capacity rehearsal plan ${path}: ${detail}`);
  }
}

function main() {
  const options = parseV3CapacityRehearsalPlanArgs(process.argv.slice(2));
  let plan: unknown;
  try {
    plan = readV3CapacityRehearsalPlan(options.planPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const assessment = assessV3CapacityRehearsalPlan(
    plan,
    options.expectedSha,
  );
  const json = `${JSON.stringify(assessment, null, 2)}\n`;

  if (options.outputPath) {
    const absoluteOutput = resolve(process.cwd(), options.outputPath);
    mkdirSync(dirname(absoluteOutput), { recursive: true });
    writeFileSync(absoluteOutput, json, "utf8");
    console.error(`[v3-s12-capacity-plan] wrote ${options.outputPath}`);
  } else {
    process.stdout.write(json);
  }

  if (assessment.status === "invalid") {
    process.exitCode = 2;
  }
  if (
    options.requireReady &&
    assessment.status !== "ready_for_execution_review"
  ) {
    process.exitCode = 3;
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (entrypoint === import.meta.url) {
  main();
}
