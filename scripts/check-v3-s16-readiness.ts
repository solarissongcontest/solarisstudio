import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { V3_S16_CERTIFICATION_CATEGORIES } from "../src/lib/v3-s16-certification-contract";
import { validateV3S16CategorySourceEvidence } from "../src/lib/v3-s16-evidence-validation";
import { assessV3S16StaticReleaseReadiness } from "../src/lib/v3-s16-static-release-readiness";
import {
  requiredV3S16OrganizerAcceptanceCases,
  requiredV3S16PublicAcceptanceCases,
  V3_S16_ACCESSIBILITY_REQUIRED_CASES,
  V3_S16_NAVIGATION_REQUIRED_CASES,
  V3_S16_RESPONSIVE_REQUIRED_CASES,
} from "../src/lib/v3-s16-surface-evidence-contract";

const json = process.argv.includes("--json");
const requireReady = process.argv.includes("--require-ready");
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function currentCandidateSha() {
  const requested = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase();
  if (requested) return requested;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  } catch {
    return "unknown";
  }
}

const candidateSha = currentCandidateSha();
const evidenceDir = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
const candidateValid = SHA_PATTERN.test(candidateSha);
const categories = V3_S16_CERTIFICATION_CATEGORIES.map((category) => {
  const path = join(evidenceDir, category.evidenceFilename);
  if (!existsSync(path)) {
    return {
      id: category.id,
      evidenceFilename: category.evidenceFilename,
      present: false,
      passed: false,
      blockers: [`missing exact-candidate evidence: ${category.evidenceFilename}`],
    };
  }

  try {
    const evidence = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const blockers = candidateValid
      ? validateV3S16CategorySourceEvidence(category.id, evidence, candidateSha)
      : ["candidate SHA is unavailable or invalid"];
    return {
      id: category.id,
      evidenceFilename: category.evidenceFilename,
      present: true,
      passed: blockers.length === 0,
      blockers,
    };
  } catch {
    return {
      id: category.id,
      evidenceFilename: category.evidenceFilename,
      present: true,
      passed: false,
      blockers: [`${category.evidenceFilename} is not valid JSON`],
    };
  }
});

const staticReadiness = assessV3S16StaticReleaseReadiness();
const passedCount = categories.filter((category) => category.passed).length;
const result = {
  schemaVersion: 1,
  candidateSha,
  candidateValid,
  evidenceDirectory: evidenceDir,
  ready:
    candidateValid &&
    passedCount === categories.length &&
    staticReadiness.ready,
  categoryCount: categories.length,
  passedCount,
  categories,
  staticBlockersClear: staticReadiness.ready,
  staticBlockers: {
    authorizationReady: staticReadiness.authorization.ready,
    authorizationDeclaredCount: staticReadiness.authorization.declaredCount,
    authorizationKnownGapCount: staticReadiness.authorization.knownGapCount,
    authorizationIncompleteVerifiedCount:
      staticReadiness.authorization.incompleteVerifiedCommands.length,
    publicCutoverRemaining: staticReadiness.publicCutoverRemaining,
    organizerCutoverRemaining: staticReadiness.organizerCutoverRemaining,
    pendingPhysicalDomains: staticReadiness.pendingPhysicalDomains,
    declarationOnlyConsequences: staticReadiness.declarationOnlyConsequences,
    publicParityMissingEvidence: staticReadiness.publicParityMissingEvidence,
  },
  requiredSurfaceCases: {
    publicAcceptance: requiredV3S16PublicAcceptanceCases().length,
    organizerAcceptance: requiredV3S16OrganizerAcceptanceCases().length,
    navigationAcceptance: V3_S16_NAVIGATION_REQUIRED_CASES.length,
    accessibility: V3_S16_ACCESSIBILITY_REQUIRED_CASES.length,
    responsiveBehavior: V3_S16_RESPONSIVE_REQUIRED_CASES.length,
  },
};

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(
    `S16 readiness: ${result.ready ? "READY" : "BLOCKED"} (${passedCount}/${categories.length} categories passing)\n`,
  );
  process.stdout.write(`Candidate: ${candidateSha}\n`);
  for (const category of categories) {
    process.stdout.write(
      `- ${category.id}: ${category.passed ? "PASS" : category.present ? "BLOCKED" : "MISSING"}\n`,
    );
    for (const blocker of category.blockers) process.stdout.write(`  - ${blocker}\n`);
  }
  for (const blocker of staticReadiness.blockers) {
    process.stdout.write(`- static-release-state: ${blocker}\n`);
  }
}

if (requireReady && !result.ready) process.exit(1);
