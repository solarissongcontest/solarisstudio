import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assessV3CapacityEvidencePortfolio } from "../src/lib/v3-capacity-portfolio";

type UnknownRecord = Record<string, unknown>;

function fail(message: string): never {
  console.error(`[v3-s12-capacity-portfolio] FAIL: ${message}`);
  process.exit(1);
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function validIsoTimestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * The canonical per-scenario producer writes `{ generatedAt, assessment }`.
 * Keep direct assessment JSON temporarily compatible for manually retained
 * historical evidence, but any document that looks like a producer envelope
 * must be a complete, valid envelope. A half-envelope must not silently fall
 * back to raw-assessment interpretation.
 */
export function unwrapV3CapacityAssessmentArtifact(
  value: unknown,
  label = "capacity assessment artifact",
): unknown {
  const record = asRecord(value);
  if (!record) {
    throw new Error(`${label} must be a JSON object`);
  }

  const envelopeLike = "generatedAt" in record || "assessment" in record;
  if (!envelopeLike) return value;

  if (!validIsoTimestamp(record.generatedAt)) {
    throw new Error(`${label} producer envelope has an invalid generatedAt timestamp`);
  }
  if (!asRecord(record.assessment)) {
    throw new Error(`${label} producer envelope must contain an assessment object`);
  }

  return record.assessment;
}

export function readV3CapacityAssessmentArtifact(path: string): unknown {
  const absolute = resolve(process.cwd(), path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read ${path}: ${detail}`);
  }

  return unwrapV3CapacityAssessmentArtifact(parsed, path);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    fail(
      "usage: tsx scripts/generate-v3-capacity-portfolio.ts <exact-commit-sha> <assessment.json> [assessment.json ...]",
    );
  }

  const [expectedCommitSha, ...assessmentPaths] = args;
  const assessments = assessmentPaths.map((path) => {
    try {
      return readV3CapacityAssessmentArtifact(path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      fail(detail);
    }
  });

  const portfolio = assessV3CapacityEvidencePortfolio(assessments, expectedCommitSha);
  const json = `${JSON.stringify(portfolio, null, 2)}\n`;
  const outputPath = process.env.V3_CAPACITY_PORTFOLIO_OUTPUT?.trim();

  if (outputPath) {
    writeFileSync(resolve(process.cwd(), outputPath), json, "utf8");
    console.error(`[v3-s12-capacity-portfolio] wrote ${outputPath}`);
  } else {
    process.stdout.write(json);
  }

  if (portfolio.status === "invalid") {
    process.exitCode = 2;
  }
  if (
    process.env.V3_CAPACITY_REQUIRE_PORTFOLIO_REVIEW_READY === "1" &&
    portfolio.status !== "ready_for_qa_review"
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
