import { assertS14Certification } from "./lib/v3-s14-certification";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const requireZero = process.argv.includes("--require-zero");

function currentCommitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
}

const checkedOutSha = currentCommitSha();
const requestedCandidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || "";

if (!/^[0-9a-f]{40}$/.test(requestedCandidateSha)) {
  throw new Error("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
}
if (requestedCandidateSha !== checkedOutSha) {
  throw new Error(
    `V3_CANDIDATE_SHA ${requestedCandidateSha} does not match checked-out SHA ${checkedOutSha}`,
  );
}

const certifiedS14Path = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence", "s14-full-contest.json");
assertS14Certification(JSON.parse(readFileSync(certifiedS14Path, "utf8")), requestedCandidateSha);

const readinessRaw = execFileSync(
  "bun",
  ["run", "scripts/check-v3-s15-zero-orphan-readiness.ts", "--json"],
  {
    encoding: "utf8",
    env: process.env,
  },
);
const readiness = JSON.parse(readinessRaw) as Record<string, unknown>;
const physicalOwnership = readiness.physicalOwnership as Record<string, unknown> | undefined;
if (
  typeof readiness.schemaVersion !== "number" ||
  typeof readiness.zeroOrphans !== "boolean" ||
  !Array.isArray(readiness.findings) ||
  !readiness.inventory ||
  typeof readiness.inventory !== "object" ||
  !physicalOwnership ||
  typeof physicalOwnership.schemaVersion !== "number" ||
  typeof physicalOwnership.zeroOwnershipConflicts !== "boolean"
) {
  throw new Error("S15 readiness output does not match the zero-orphan evidence contract");
}
if (readiness.zeroOrphans === true && readiness.findings.length !== 0) {
  throw new Error("S15 readiness claimed zeroOrphans=true while retaining findings");
}
if (readiness.zeroOrphans === true && physicalOwnership.zeroOwnershipConflicts !== true) {
  throw new Error("S15 readiness claimed zeroOrphans=true while physical ownership is not conflict-free");
}

const evidence = {
  ...readiness,
  candidateSha: requestedCandidateSha,
};

const outputDir = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, "s15-zero-orphan.json");
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

process.stdout.write(
  `S15 exact-SHA evidence: ${readiness.zeroOrphans ? "ZERO ORPHANS" : "NOT READY"} (${requestedCandidateSha})\n`,
);
process.stdout.write(`Evidence: ${outputPath}\n`);

if (requireZero && readiness.zeroOrphans !== true) process.exit(1);
