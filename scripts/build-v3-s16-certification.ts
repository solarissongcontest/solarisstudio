import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
} from "../src/lib/v3-capability-registry";
import { assessV3S16AuthorizationReadiness } from "../src/lib/v3-s16-authorization-readiness";
import {
  V3_S16_CERTIFICATION_CATEGORIES,
  type V3S16CertificationCategoryEvidence,
  type V3S16CertificationEvidence,
} from "../src/lib/v3-s16-certification-contract";
import { validateV3S16CategorySourceEvidence } from "../src/lib/v3-s16-evidence-validation";

const requireCertified = process.argv.includes("--require-certified");
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function currentCommitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
}

const checkedOutSha = currentCommitSha();
const requestedCandidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || "";

if (!SHA_PATTERN.test(requestedCandidateSha)) {
  throw new Error("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
}
if (requestedCandidateSha !== checkedOutSha) {
  throw new Error(
    `V3_CANDIDATE_SHA ${requestedCandidateSha} does not match checked-out SHA ${checkedOutSha}`,
  );
}

const evidenceDir = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
mkdirSync(evidenceDir, { recursive: true });

const categories: Array<V3S16CertificationCategoryEvidence & { reason?: string }> = [];

for (const category of V3_S16_CERTIFICATION_CATEGORIES) {
  const path = join(evidenceDir, category.evidenceFilename);
  let evidenceCandidateSha = "";
  let passed = false;
  let reason: string | undefined;

  if (!existsSync(path)) {
    reason = `missing exact-candidate evidence: ${category.evidenceFilename}`;
  } else {
    try {
      const evidence = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      evidenceCandidateSha =
        typeof evidence.candidateSha === "string" ? evidence.candidateSha.trim().toLowerCase() : "";
      const issues = validateV3S16CategorySourceEvidence(
        category.id,
        evidence,
        requestedCandidateSha,
      );
      if (issues.length) reason = issues.join("; ");
      else passed = true;
    } catch {
      reason = `${category.evidenceFilename} is not valid JSON exact-candidate evidence`;
    }
  }

  categories.push({
    id: category.id,
    evidenceFilename: category.evidenceFilename,
    evidenceCandidateSha,
    passed,
    ...(reason ? { reason } : {}),
  });
}

const authorization = assessV3S16AuthorizationReadiness();
const publicRemaining = V3_PUBLIC_CAPABILITIES.filter(
  (item) => !["cutover", "retired"].includes(item.specificationStatus),
);
const organizerRemaining = V3_ORGANIZER_CAPABILITY_REGISTRY.filter(
  (item) => !["cutover", "retired"].includes(item.migrationStatus),
);
const staticBlockers: string[] = [];
if (!authorization.ready) {
  staticBlockers.push(
    `authorization readiness incomplete: ${authorization.knownGapCount} known gaps, ${authorization.incompleteVerifiedCommands.length} incomplete verified commands`,
  );
}
if (publicRemaining.length) {
  staticBlockers.push(`${publicRemaining.length} Public capabilities are not cutover/retired`);
}
if (organizerRemaining.length) {
  staticBlockers.push(`${organizerRemaining.length} Organizer capabilities are not cutover/retired`);
}

const allCategoriesPassed = categories.every((category) => category.passed);
const certified = allCategoriesPassed && staticBlockers.length === 0;
const certification: V3S16CertificationEvidence = {
  schemaVersion: 1,
  candidateSha: requestedCandidateSha,
  certified,
  categories,
};

const outputPath = join(evidenceDir, "s16-certification.json");
writeFileSync(outputPath, `${JSON.stringify(certification, null, 2)}\n`, "utf8");

if (certified) {
  process.stdout.write(`S16 exact-SHA certification: CERTIFIED (${requestedCandidateSha})\n`);
} else {
  process.stdout.write(`S16 exact-SHA certification: BLOCKED (${requestedCandidateSha})\n`);
  for (const category of categories) {
    if (!category.passed) process.stdout.write(`- ${category.id}: ${category.reason || "not passed"}\n`);
  }
  for (const blocker of staticBlockers) process.stdout.write(`- static-release-state: ${blocker}\n`);
}
process.stdout.write(`Evidence: ${outputPath}\n`);

if (requireCertified && !certified) process.exit(1);
