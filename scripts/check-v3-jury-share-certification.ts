import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessV3JuryShareCertificationReadiness } from "../src/lib/v3-jury-share-certification";

function fail(message: string): never {
  console.error(`[v3-jury-share-certification] FAIL: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const requireReady = args.includes("--require-ready");
const positional = args.filter((arg) => arg !== "--require-ready");

if (positional.length < 2) {
  fail(
    "usage: tsx scripts/check-v3-jury-share-certification.ts <exact-candidate-sha> <evidence.json> [more-evidence.json ...] [--require-ready]",
  );
}

const [candidateSha, ...evidencePaths] = positional;
const evidenceValues = evidencePaths.map((evidencePath) => {
  try {
    return JSON.parse(
      readFileSync(resolve(process.cwd(), evidencePath), "utf8"),
    ) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`cannot read Jury Share evidence ${evidencePath}: ${detail}`);
  }
});

const readiness = assessV3JuryShareCertificationReadiness(evidenceValues, candidateSha);
const json = `${JSON.stringify(readiness, null, 2)}\n`;
const outputPath = process.env.V3_JURY_SHARE_QA_OUTPUT?.trim();

if (outputPath) {
  writeFileSync(resolve(process.cwd(), outputPath), json, "utf8");
  console.error(`[v3-jury-share-certification] wrote ${outputPath}`);
} else {
  process.stdout.write(json);
}

if (requireReady && !readiness.passed) {
  process.exitCode = 2;
}
