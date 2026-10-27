import { isResolvedV3DomainConsequence } from "../src/lib/v3-domain-consequence-registry";
import { buildV3ReleaseRiskReport, type V3ReleaseInventoryItem } from "../src/lib/v3-release-risk";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
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

const discovery = process.argv.includes("--discovery");
const wantsJson = process.argv.includes("--json");
const finalCertification = process.argv.includes("--certified");
const strictRelease = process.argv.includes("--release") || finalCertification;
const errors: string[] = [];
const warnings: string[] = [];
const certificationBlockers: string[] = [];

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

for (const duplicate of duplicateValues(V3_PUBLIC_CAPABILITIES.map((item) => item.id))) errors.push(`duplicate Public capability: ${duplicate}`);
for (const duplicate of duplicateValues(V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => item.legacyId))) errors.push(`duplicate Organizer capability: ${duplicate}`);
for (const duplicate of duplicateValues(V3_SYSTEM_DOMAIN_REGISTRY.map((item) => item.domain))) errors.push(`duplicate System domain owner: ${duplicate}`);

for (const capability of V3_PUBLIC_CAPABILITIES) {
  if (!capability.targetRoute.trim()) errors.push(`${capability.id}: target route is empty`);
  if (!capability.acceptanceScenarioId.trim()) errors.push(`${capability.id}: acceptance scenario is empty`);
  const evidence = "migrationEvidence" in capability ? capability.migrationEvidence?.trim() : undefined;
  if (["cutover", "retired"].includes(capability.specificationStatus) && !evidence) errors.push(`${capability.id}: ${capability.specificationStatus} requires migrationEvidence`);
  if (capability.specificationStatus === "retired" && capability.classification !== "retire") errors.push(`${capability.id}: retired status requires retire classification`);
  if (capability.specificationStatus === "parity" && !evidence) warnings.push(`${capability.id}: parity has no migrationEvidence reference`);
}

for (const capability of V3_ORGANIZER_CAPABILITY_REGISTRY) {
  if (!capability.targetRoute.trim()) errors.push(`${capability.legacyId}: target route is empty`);
  if (!capability.ownerCapability.trim()) errors.push(`${capability.legacyId}: owner capability is empty`);
  if (capability.migrationStatus === "retired" && capability.classification !== "retire") errors.push(`${capability.legacyId}: retired status requires retire classification`);
}

const ownerMap = V3_SYSTEM_CONCEPT_OWNER as Record<string, string>;
for (const concept of V3_REQUIRED_SYSTEM_CONCEPTS) if (!ownerMap[concept]) errors.push(`System concept has no canonical owner: ${concept}`);
for (const issue of validateV3DomainConsequenceRegistry()) errors.push(`consequence registry: ${issue}`);
for (const issue of validateV3WorkflowDependencyRegistry()) errors.push(`workflow registry: ${issue}`);
for (const duplicate of duplicateValues(V3_DOMAIN_CONSEQUENCE_REGISTRY.map((item) => item.eventType))) errors.push(`domain event has multiple consequence owners: ${duplicate}`);

for (const consequence of V3_DOMAIN_CONSEQUENCE_REGISTRY) {
  if (consequence.implementationState !== "event-backed") continue;
  if (!consequence.evidence.length) errors.push(`${consequence.eventType}: event-backed without evidence`);
  if (!existsSync("supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql")) errors.push(`${consequence.eventType}: event-backed without canonical S4 outbox migration`);
}

const pendingPhysical = V3_SYSTEM_DOMAIN_REGISTRY.filter((item) => item.physicalAuditStatus === "pending");
const unfinishedPublic = V3_PUBLIC_CAPABILITIES.filter((item) => !["cutover", "retired"].includes(item.specificationStatus));
const unfinishedOrganizer = V3_ORGANIZER_CAPABILITY_REGISTRY.filter((item) => !["cutover", "retired"].includes(item.migrationStatus));
const declarationOnly = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((item) => !isResolvedV3DomainConsequence(item));

const repositoryFindings = [
  ...errors.map((error) => `STRUCTURAL_INTEGRITY ${error}`),
  ...pendingPhysical.map((domain) => `PHYSICAL_OWNER_PENDING ${domain.domain}`),
  ...unfinishedPublic.map((capability) => `PUBLIC_CUTOVER_UNRESOLVED ${capability.id}:${capability.specificationStatus}`),
  ...unfinishedOrganizer.map((capability) => `ORGANIZER_CUTOVER_UNRESOLVED ${capability.legacyId}:${capability.migrationStatus}`),
  ...declarationOnly.map((consequence) => `DOMAIN_CONSEQUENCE_DECLARED ${consequence.eventType} owner=${consequence.ownerDomain}`),
  ...warnings.map((warning) => `PARITY_EVIDENCE_MISSING ${warning}`),
];

let inventory: V3ReleaseInventoryItem[] = [];
try {
  const matrix = JSON.parse(readFileSync("docs/v3-release-burndown.json", "utf8")) as {
    publicCutovers?: V3ReleaseInventoryItem[];
    organizerCutovers?: V3ReleaseInventoryItem[];
    consequences?: V3ReleaseInventoryItem[];
  };
  inventory = [...(matrix.publicCutovers ?? []), ...(matrix.organizerCutovers ?? []), ...(matrix.consequences ?? [])];
} catch (error) {
  errors.push(`release risk inventory unreadable: ${error instanceof Error ? error.message : String(error)}`);
}
const releaseRisk = buildV3ReleaseRiskReport(repositoryFindings, inventory);
const releaseRiskBlockers = releaseRisk.findings.filter((finding) =>
  finding.releaseRisk === "hard_blocker" || finding.releaseRisk === "conditional_blocker",
);

const releaseEvidenceDir = resolve(process.env.V3_RELEASE_EVIDENCE_DIR?.trim() || "v3-release-evidence");
const releasePrerequisiteEvidence = [
  "s14-full-contest.json",
  "s15-zero-orphan.json",
  "s16-mutation-authority.json",
  "security-advisor-classification.json",
  "results-integration.json",
] as const;

function semanticEvidenceFailure(filename: string, evidence: Record<string, unknown>): string | null {
  if (filename === "s14-full-contest.json" && evidence.passed !== true) return "s14-full-contest.json does not prove passed=true";
  if (filename === "s15-zero-orphan.json" && evidence.zeroOrphans !== true) return "s15-zero-orphan.json does not prove zeroOrphans=true";
  if (filename === "s16-mutation-authority.json" && evidence.s16Passed !== true) return "s16-mutation-authority.json does not prove s16Passed=true";
  if (filename === "security-advisor-classification.json" && evidence.releaseReady !== true) return "security-advisor-classification.json does not prove releaseReady=true";
  if (filename === "results-integration.json" && evidence.passed !== true) return "results-integration.json does not prove passed=true";
  return null;
}

for (const filename of releasePrerequisiteEvidence) {
  const path = join(releaseEvidenceDir, filename);
  if (!existsSync(path)) {
    certificationBlockers.push(`missing exact-candidate runtime evidence: ${filename}`);
    continue;
  }
  if (!evidenceCandidateSha) {
    certificationBlockers.push(`cannot verify exact candidate SHA for evidence: ${filename}`);
    continue;
  }
  try {
    const evidence = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const artifactShaRaw = typeof evidence.candidateSha === "string" ? evidence.candidateSha : typeof evidence.candidate_sha === "string" ? evidence.candidate_sha : "";
    const artifactSha = artifactShaRaw.trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(artifactSha)) certificationBlockers.push(`${filename} is not bound by a valid 40-character candidate SHA`);
    else if (artifactSha !== evidenceCandidateSha) certificationBlockers.push(`${filename} certifies ${artifactSha}, not exact candidate ${evidenceCandidateSha}`);
    const semanticFailure = semanticEvidenceFailure(filename, evidence);
    if (semanticFailure) certificationBlockers.push(semanticFailure);
  } catch {
    certificationBlockers.push(`${filename} is not valid JSON exact-candidate evidence`);
  }
}

if (discovery) {
  const report = {
    schemaVersion: 2,
    candidateSha: evidenceCandidateSha,
    structuralPassed: errors.length === 0,
    repositoryReady: repositoryFindings.length === 0,
    findings: repositoryFindings,
    releaseRisk,
    migrationInventory: {
      unresolvedTotal: repositoryFindings.length,
      public: unfinishedPublic.length,
      organizer: unfinishedOrganizer.length,
      consequences: declarationOnly.length,
      pendingPhysical: pendingPhysical.length,
      parityEvidenceWarnings: warnings.length,
    },
    pendingCertification: certificationBlockers,
  };
  process.stdout.write(wantsJson ? `${JSON.stringify(report, null, 2)}\n` : `${repositoryFindings.join("\n")}\n`);
  process.exit(repositoryFindings.length ? 1 : 0);
}

for (const warning of warnings) process.stderr.write(`WARNING: ${warning}\n`);
if (errors.length) {
  process.stderr.write(`V3 release-integrity structural guard failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}
if (strictRelease && (releaseRiskBlockers.length || certificationBlockers.length)) {
  const riskLines = releaseRiskBlockers.map((finding) => `${finding.releaseRisk}: ${finding.finding} [${finding.rule}]`);
  process.stderr.write(`V3 release certification is BLOCKED:\n- ${[...riskLines, ...certificationBlockers].join("\n- ")}\n`);
  process.exit(1);
}
process.stdout.write(`V3 release-integrity guard: PASS (${finalCertification ? "final-certification" : strictRelease ? "release-preflight" : "structural"})\n`);
process.stdout.write(`Release risk: hard=${releaseRisk.totals.hard_blocker} conditional=${releaseRisk.totals.conditional_blocker} tracked=${releaseRisk.totals.tracked_migration_debt} obsolete=${releaseRisk.totals.obsolete_or_replaced}; complete unresolved inventory=${releaseRisk.unresolvedTotal}\n`);
if (certificationBlockers.length) process.stdout.write(`Pending exact-SHA certification evidence:\n- ${certificationBlockers.join("\n- ")}\n`);
