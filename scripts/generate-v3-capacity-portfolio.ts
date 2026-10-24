import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessV3CapacityEvidencePortfolio } from "../src/lib/v3-capacity-portfolio";

function fail(message: string): never {
  console.error(`[v3-s12-capacity-portfolio] FAIL: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  fail(
    "usage: tsx scripts/generate-v3-capacity-portfolio.ts <exact-commit-sha> <assessment.json> [assessment.json ...]",
  );
}

const [expectedCommitSha, ...assessmentPaths] = args;
const assessments = assessmentPaths.map((path) => {
  const absolute = resolve(process.cwd(), path);
  try {
    return JSON.parse(readFileSync(absolute, "utf8")) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`cannot read ${path}: ${detail}`);
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
