import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessV3S12CapacityQaEvidence } from "../src/lib/v3-s12-capacity-qa";

function fail(message: string): never {
  console.error(`[v3-s12-capacity-qa] FAIL: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const requireReady = args.includes("--require-ready");
const positional = args.filter((arg) => arg !== "--require-ready");

if (positional.length !== 2) {
  fail(
    "usage: tsx scripts/check-v3-s12-capacity-qa.ts <exact-candidate-sha> <capacity-portfolio.json> [--require-ready]",
  );
}

const [candidateSha, portfolioPath] = positional;
let portfolio: unknown;
try {
  portfolio = JSON.parse(readFileSync(resolve(process.cwd(), portfolioPath), "utf8")) as unknown;
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(`cannot read capacity portfolio ${portfolioPath}: ${detail}`);
}

const evidence = assessV3S12CapacityQaEvidence(portfolio, candidateSha);
const json = `${JSON.stringify(evidence, null, 2)}\n`;
const outputPath = process.env.V3_S12_CAPACITY_QA_OUTPUT?.trim();

if (outputPath) {
  writeFileSync(resolve(process.cwd(), outputPath), json, "utf8");
  console.error(`[v3-s12-capacity-qa] wrote ${outputPath}`);
} else {
  process.stdout.write(json);
}

if (requireReady && !evidence.passed) {
  process.exitCode = 2;
}
