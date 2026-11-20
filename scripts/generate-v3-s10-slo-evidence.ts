import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessV3S10SloEvidence } from "../src/lib/v3-s10-slo-evidence";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "s10-slo-evidence.json";
if (!inputPath) {
  throw new Error(
    "Usage: V3_S10_EXPECTED_SHA=<sha> tsx scripts/generate-v3-s10-slo-evidence.ts <input.json> [output.json]",
  );
}

const expectedSha = requiredEnvironment("V3_S10_EXPECTED_SHA");
const input = JSON.parse(readFileSync(resolve(inputPath), "utf8")) as unknown;
const assessment = assessV3S10SloEvidence(input, expectedSha);
writeFileSync(resolve(outputPath), `${JSON.stringify(assessment, null, 2)}\n`, "utf8");

if (process.env.V3_S10_REQUIRE_REVIEW_READY === "1" && !assessment.passed) {
  console.error(
    `[v3-s10-evidence] ${assessment.status}: ${assessment.issuesFound.join("; ") || "not ready"}`,
  );
  process.exitCode = 1;
} else {
  console.log(`[v3-s10-evidence] ${assessment.status}; wrote ${outputPath}`);
}
