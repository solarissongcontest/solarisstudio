import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_CONCEPT_OWNER,
  V3_SYSTEM_DOMAIN_REGISTRY,
  validateV3DomainConsequenceRegistry,
  validateV3WorkflowDependencyRegistry,
} from "../src/lib/v3-capability-registry";

const strictRelease = process.argv.includes("--release");
const errors: string[] = [];
const blockers: string[] = [];
const warnings: string[] = [];

function duplicateValues(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate];
}

function currentCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  } catch {
    return null;
  }
}

const checkedOutSha = currentCommitSha();
const requestedCandidateSha = process.env.V3_CANDIDATE_SHA?.trim().toLowerCase() || null;
if (requestedCandidateSha && checkedOutSha && requestedCandidateSha !== checkedOutSha) {
  errors.push(`V3_CANDIDATE_SHA ${requestedCandidateSha} does not match checked-out SHA ${checkedOutSha}`);
}
const evidenceCandidateSha = requestedCandidateSha || checkedOutSha;

for (const duplicate of duplicateValues(V3_PUBLIC_CAPABILITIES.map((item) => item.id))) {
  errors.push(`duplicate Public capability: ${duplicate}`);
}
for (const duplicate of duplicateValues(V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => item.legacyId))) {
  errors.push(`duplicate Organizer capability: ${duplicate}`);
}
for (const duplicate of duplicateValues(V3_SYSTEM_DOMAIN_REGISTRY.map((item) => item.domain))) {
  errors.push(`duplicate System domain owner: ${duplicate}`);
}

for (const capability of V3_PUBLIC_CAPABILITIES) {
  if (!capability.targetRoute.trim()) errors.push(`${capability.id}: target route is empty`);
  if (!capability.acceptanceScenarioId.trim()) errors.push(`${capability.id}: acceptance scenario is empty`);
  const evidence = "migrationEvidence" in capability ? capability.migrationEvidence?.trim() : undefined;
  if (["cutover", "retired"].includes(capability.specificationStatus) && !evidence) {
    errors.push(`${capability.id}: ${capability.specificationStatus} requires migrationEvidence`);
  }
  if (capability.specificationStatus === "retired" && capability.classification !== "retire") {
    errors.push(`${capability.id}: retired status requires retire classification`);
  }
  if (capability.specificationStatus === "parity" && !evidence) {
    warnings.push(`${capability.id}: parity has no migrationEvidence reference`);
  }
}

for (const capability of V3_ORGANIZER_CAPABILITY_REGISTRY) {
  if (!capability.targetRoute.trim()) errors.push(`${capability.legacyId}: target route is empty`);
  if (!capability.ownerCapability.trim()) errors.push(`${capability.legacyId}: owner capability is empty`);
  if (capability.migrationStatus === "retired" && capability.classification !== "retire") {
    errors.push(`${capability.legacyId}: retired status requires retire classification`);
  }
}

const ownerMap = V3_SYSTEM_CONCEPT_OWNER as Record<string, string>;
for (const concept of V3_REQUIRED_SYSTEM_CONCEPTS) {
  if (!ownerMap[concept]) errors.push(`System concept has no canonical owner: ${concept}`);
}

for (const issue of validateV3DomainConsequenceRegistry()) errors.push(`consequence registry: ${issue}`);
for (const issue of validateV3WorkflowDependencyRegistry()) errors.push(`workflow registry: ${issue}`);

const eventNames = V3_DOMAIN_CONSEQUENCE_REGISTRY.map((item) => item.eventType);
for (const duplicate of duplicateValues(eventNames)) errors.push(`domain event has multiple consequence owners: ${duplicate}`);

for (const consequence of V3_DOMAIN_CONSEQUENCE_REGISTRY) {
  if (consequence.implementationState !== "event-backed") continue;
  if (!consequence.evidence.length) errors.push(`${consequence.eventType}: event-backed without evidence`);
  if (!existsSync("supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql")) {
    errors.push(`${consequence.eventType}: event-backed without canonical S4 outbox migration`);
  }
}

const pendingPhysical = V3_SYSTEM_DOMAIN_REGISTRY.filter((item) => item.physicalAuditStatus === "pending");
const unfinishedPublic = V3_PUBLIC_CAPABILITIES.filter((item) =>
  !["cutover", "retired"].includes(item.specificationStatus),
);
const unfinishedOrganizer = V3_ORGANIZER_CAPABILITY_REGISTRY.filter((item) =>
  !["cutover", "retired"].includes(item.migrationStatus),
);
const declarationOnly = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((item) => item.implementationState !== "event-backed");

if (pendingPhysical.length) blockers.push(`${pendingPhysical.length} System physical ownership audits pending`);
if (unfinishedPublic.length) blockers.push(`${unfinishedPublic.length} Public capabilities not cutover/retired`);
if (unfinishedOrganizer.length) blockers.push(`${unfinishedOrganizer.length} Organizer capabilities not cutover/retired`);
if (declarationOnly.length) blockers.push(`${declarationOnly.length} domain consequences not event-backed`);
if (warnings.length) blockers.push(`${warnings.length} parity capabilities missing explicit migration evidence`);

const exactCandidateEvidence = [
  "artifacts/v3-release/s14-full-contest.json",
  "artifacts/v3-release/s15-zero-orphan.json",
  "artifacts/v3-release/security-advisor-classification.json",
  "artifacts/v3-release/s16-certification.json",
] as const;

for (const path of exactCandidateEvidence) {
  if (!existsSync(path)) {
    blockers.push(`missing exact-candidate evidence: ${path}`);
    continue;
  }
  if (!evidenceCandidateSha) {
    blockers.push(`cannot verify exact candidate SHA for evidence: ${path}`);
    continue;
  }
  try {
    const evidence = JSON.parse(readFileSync(path, "utf8")) as { candidateSha?: unknown };
    const artifactSha = typeof evidence.candidateSha === "string" ? evidence.candidateSha.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{40}$/.test(artifactSha)) {
      blockers.push(`${path} is not bound by a valid 40-character candidateSha`);
    } else if (artifactSha !== evidenceCandidateSha) {
      blockers.push(`${path} certifies ${artifactSha}, not exact candidate ${evidenceCandidateSha}`);
    }
  } catch {
    blockers.push(`${path} is not valid JSON exact-candidate evidence`);
  }
}

for (const warning of warnings) process.stderr.write(`WARNING: ${warning}\n`);

if (errors.length) {
  process.stderr.write(`V3 release-integrity structural guard failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}
if (strictRelease && blockers.length) {
  process.stderr.write(`V3 release certification is BLOCKED:\n- ${blockers.join("\n- ")}\n`);
  process.exit(1);
}

process.stdout.write(`V3 release-integrity guard: PASS (${strictRelease ? "release-strict" : "structural"})\n`);
if (blockers.length) process.stdout.write(`Current release blockers:\n- ${blockers.join("\n- ")}\n`);
