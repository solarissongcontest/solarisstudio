import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  V3_S16_CERTIFICATION_CATEGORIES,
  type V3S16CertificationCategoryEvidence,
  type V3S16CertificationEvidence,
} from "../src/lib/v3-s16-certification-contract";

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

      if (!SHA_PATTERN.test(evidenceCandidateSha)) {
        reason = `${category.evidenceFilename} is not bound by a valid 40-character candidateSha`;
      } else if (evidenceCandidateSha !== requestedCandidateSha) {
        reason = `${category.evidenceFilename} certifies ${evidenceCandidateSha}, not exact candidate ${requestedCandidateSha}`;
      } else if (evidence[category.passField] !== true) {
        reason = `${category.evidenceFilename} does not prove ${category.passField}=true`;
      } else {
        passed = true;
      }
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

const certified = categories.every((category) => category.passed);
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
}
process.stdout.write(`Evidence: ${outputPath}\n`);

if (requireCertified && !certified) process.exit(1);
