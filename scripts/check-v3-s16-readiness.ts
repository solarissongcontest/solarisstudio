import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
  V3_SYSTEM_DOMAIN_REGISTRY,
} from "../src/lib/v3-capability-registry";
import { assessV3S16AuthorizationReadiness } from "../src/lib/v3-s16-authorization-readiness";
import { V3_S16_CERTIFICATION_CATEGORIES } from "../src/lib/v3-s16-certification-contract";
import { validateV3S16CategorySourceEvidence } from "../src/lib/v3-s16-evidence-validation";
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

const authorization = assessV3S16AuthorizationReadiness();
const publicRemaining = V3_PUBLIC_CAPABILITIES.filter(
  (item) => !["cutover", "retired"].includes(item.specificationStatus),
);
const organizerRemaining = V3_ORGANIZER_CAPABILITY_REGISTRY.filter(
  (item) => !["cutover", "retired"].includes(item.migrationStatus),
);
const pendingPhysicalDomains = V3_SYSTEM_DOMAIN_REGISTRY.filter(
  (item) => item.physicalAuditStatus === "pending",
);
const declarationOnlyConsequences = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(
  (item) => item.implementationState !== "event-backed",
);
const publicParityMissingEvidence = V3_PUBLIC_CAPABILITIES.filter(
  (item) =>
    ["parity", "cutover", "retired"].includes(item.specificationStatus) &&
    !("migrationEvidence" in item && item.migrationEvidence?.trim()),
);
const passedCount = categories.filter((category) => category.passed).length;
const staticBlockersClear =
  authorization.ready &&
  publicRemaining.length === 0 &&
  organizerRemaining.length === 0 &&
  pendingPhysicalDomains.length === 0 &&
  declarationOnlyConsequences.length === 0 &&
  publicParityMissingEvidence.length === 0;
const result = {
  schemaVersion: 1,
  candidateSha,
  candidateValid,
  evidenceDirectory: evidenceDir,
  ready:
    candidateValid &&
    passedCount === categories.length &&
    staticBlockersClear,
  categoryCount: categories.length,
  passedCount,
  categories,
  staticBlockersClear,
  staticBlockers: {
    authorizationReady: authorization.ready,
    authorizationDeclaredCount: authorization.declaredCount,
    authorizationKnownGapCount: authorization.knownGapCount,
    authorizationIncompleteVerifiedCount: authorization.incompleteVerifiedCommands.length,
    publicCutoverRemaining: publicRemaining.length,
    organizerCutoverRemaining: organizerRemaining.length,
    pendingPhysicalDomains: pendingPhysicalDomains.length,
    declarationOnlyConsequences: declarationOnlyConsequences.length,
    publicParityMissingEvidence: publicParityMissingEvidence.length,
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
  if (!authorization.ready) {
    process.stdout.write(
      `Static authorization blocker: ${authorization.declaredCount} declared, ${authorization.knownGapCount} known gaps, ${authorization.incompleteVerifiedCommands.length} incomplete verified commands\n`,
    );
  }
  if (publicRemaining.length) {
    process.stdout.write(`Static Public blocker: ${publicRemaining.length} capabilities not cutover/retired\n`);
  }
  if (organizerRemaining.length) {
    process.stdout.write(
      `Static Organizer blocker: ${organizerRemaining.length} capabilities not cutover/retired\n`,
    );
  }
  if (pendingPhysicalDomains.length) {
    process.stdout.write(
      `Static System blocker: ${pendingPhysicalDomains.length} physical ownership audits pending\n`,
    );
  }
  if (declarationOnlyConsequences.length) {
    process.stdout.write(
      `Static consequence blocker: ${declarationOnlyConsequences.length} consequences are not event-backed\n`,
    );
  }
  if (publicParityMissingEvidence.length) {
    process.stdout.write(
      `Static Public evidence blocker: ${publicParityMissingEvidence.length} parity/cutover/retired capabilities lack migration evidence\n`,
    );
  }
}

if (requireReady && !result.ready) process.exit(1);
