import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assessV3S16AuthorizationReadiness } from "../src/lib/v3-s16-authorization-readiness";

const requirePassed = process.argv.includes("--require-passed");
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function currentCommitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
}

const candidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || "";
const checkedOutSha = currentCommitSha();
if (!SHA_PATTERN.test(candidateSha)) {
  throw new Error("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
}
if (candidateSha !== checkedOutSha) {
  throw new Error(`V3_CANDIDATE_SHA ${candidateSha} does not match checked-out SHA ${checkedOutSha}`);
}

const authorization = assessV3S16AuthorizationReadiness();
const evidenceDir = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
mkdirSync(evidenceDir, { recursive: true });
const securityPath = join(evidenceDir, "security-advisor-classification.json");

let securityClassificationPresent = false;
let securityClassificationExactSha = false;
let securityReleaseReady = false;
let securityClassificationReason: string | null = null;

if (!existsSync(securityPath)) {
  securityClassificationReason = "missing security-advisor-classification.json";
} else {
  try {
    const security = JSON.parse(readFileSync(securityPath, "utf8")) as Record<string, unknown>;
    securityClassificationPresent = true;
    const securitySha =
      typeof security.candidateSha === "string" ? security.candidateSha.trim().toLowerCase() : "";
    securityClassificationExactSha = securitySha === candidateSha;
    securityReleaseReady = security.releaseReady === true;
    if (!SHA_PATTERN.test(securitySha)) {
      securityClassificationReason = "security advisor classification has no valid candidateSha";
    } else if (!securityClassificationExactSha) {
      securityClassificationReason = `security advisor classification certifies ${securitySha}, not ${candidateSha}`;
    } else if (!securityReleaseReady) {
      securityClassificationReason = "security advisor classification does not prove releaseReady=true";
    }
  } catch {
    securityClassificationReason = "security-advisor-classification.json is not valid JSON";
  }
}

const passed = authorization.ready && securityClassificationExactSha && securityReleaseReady;
const evidence = {
  schemaVersion: 1,
  candidateSha,
  passed,
  authorization,
  securityAdvisors: {
    present: securityClassificationPresent,
    exactCandidateSha: securityClassificationExactSha,
    releaseReady: securityReleaseReady,
    reason: securityClassificationReason,
  },
};

const outputPath = join(evidenceDir, "s16-authorization-security.json");
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

process.stdout.write(`S16 authorization/security evidence: ${passed ? "PASS" : "BLOCKED"} (${candidateSha})\n`);
if (!authorization.ready) {
  process.stdout.write(
    `- authorization registry: ${authorization.declaredCount} declared, ${authorization.registryErrors.length} structural errors, ${authorization.knownGapCount} known gaps\n`,
  );
}
if (!securityClassificationExactSha || !securityReleaseReady) {
  process.stdout.write(`- security advisors: ${securityClassificationReason || "not release-ready"}\n`);
}
process.stdout.write(`Evidence: ${outputPath}\n`);

if (requirePassed && !passed) process.exit(1);
