import { classifyV3ReleaseFinding, type V3ReleaseInventoryItem } from "../src/lib/v3-release-risk";
import { isResolvedV3DomainConsequence } from "../src/lib/v3-domain-consequence-registry";
import { existsSync, readFileSync } from "node:fs";
import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
} from "../src/lib/v3-capability-registry";
import {
  V3_S14_FAILURE_INJECTIONS,
  V3_S14_INVARIANTS,
  V3_S14_SEED_CONTRACT,
  V3_S14_STAGES,
} from "./v3-s14-full-contest-spec";

const requireReady = process.argv.includes("--require-ready");

const lifecycle = [
  "edition setup",
  "delegations",
  "confirmation rounds",
  "participant confirmations",
  "entries",
  "media",
  "review/corrections",
  "Jury",
  "Televote",
  "integrity/error cases",
  "results",
  "publication",
  "notifications",
  "Organizer tasks",
  "Public projections",
  "archive/history consequences",
] as const;

const negativeCases = [
  "duplicate confirmation",
  "closed-round submission",
  "stale entry edit",
  "unauthorized jury",
  "duplicate vote",
  "invalid ballot",
  "wrong-country mutation",
  "network ambiguity and retry",
  "partially processed consequence",
  "results calculation with missing input",
  "publish before lock",
  "stale notification deep link",
  "permission revoked after notification",
] as const;

const focusedLocalAssets = [
  ".github/scripts/v3-confirmation-security-rehearsal.sh",
  ".github/scripts/v3-entry-receipt-security-rehearsal.sh",
  ".github/scripts/v3-jury-security-rehearsal.sh",
  ".github/scripts/v3-televote-reconciliation-rehearsal.sh",
  ".github/scripts/v3-s3-results-invariants-rehearsal.sh",
  ".github/scripts/v3-s3-publication-invariants-rehearsal.sh",
  ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
] as const;

const publicRequired = ["confirmations", "entry", "jury", "televote", "results"] as const;
const organizerRequired = [
  "current-edition-delegations",
  "current-edition-contest",
  "current-edition-voting",
  "current-edition-results",
  "operations-control-room",
] as const;

const blockers: string[] = [];
const publicStatus = new Map(V3_PUBLIC_CAPABILITIES.map((item) => [item.id, item.specificationStatus]));
const organizerStatus = new Map(V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item.migrationStatus]));
const matrix = JSON.parse(readFileSync("docs/v3-release-burndown.json", "utf8")) as {
  publicCutovers: V3ReleaseInventoryItem[]; organizerCutovers: V3ReleaseInventoryItem[];
};
const inventory = [...matrix.publicCutovers, ...matrix.organizerCutovers];
const currentFindings: string[] = [];
for (const id of publicRequired) {
  const status = publicStatus.get(id);
  if (!status) blockers.push(`unregistered critical Public capability ${id}`);
  else if (!["cutover", "retired"].includes(status)) currentFindings.push(`PUBLIC_CUTOVER_UNRESOLVED ${id}:${status}`);
}
for (const id of organizerRequired) {
  const status = organizerStatus.get(id);
  if (!status) blockers.push(`unregistered critical Organizer capability ${id}`);
  else if (!["cutover", "retired"].includes(status)) currentFindings.push(`ORGANIZER_CUTOVER_UNRESOLVED ${id}:${status}`);
}
const relevantConsequences = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((item) => !isResolvedV3DomainConsequence(item));
currentFindings.push(...relevantConsequences.map((item) => `DOMAIN_CONSEQUENCE_DECLARED ${item.eventType} owner=${item.ownerDomain}`));
const releaseRisks = currentFindings.map((finding) => classifyV3ReleaseFinding(finding, inventory.find((item) => item.exactFinding === finding)));
blockers.push(...releaseRisks.filter((item) => item.releaseRisk === "hard_blocker").map((item) => item.finding));
// This scanner checks harness structure. Actual execution additionally requires
// exact-head isolation, migration adoption, focused workflows and S16 catalog
// authority in the release preflight. Passing here is never release readiness.

const missingAssets = focusedLocalAssets.filter((path) => !existsSync(path));
if (missingAssets.length) blockers.push(`missing focused local rehearsal assets: ${missingAssets.join(", ")}`);

const unifiedDriver = ".github/scripts/v3-full-contest-rehearsal.sh";
const runtimeLibrary = ".github/scripts/v3-s14-lib.sh";
const unifiedDriverPresent = existsSync(unifiedDriver);
const runtimeLibraryPresent = existsSync(runtimeLibrary);
const driverSource = unifiedDriverPresent ? readFileSync(unifiedDriver, "utf8") : "";
const runtimeSource = runtimeLibraryPresent ? readFileSync(runtimeLibrary, "utf8") : "";

if (!unifiedDriverPresent) {
  blockers.push(
    "unified S14 driver does not exist yet; focused rehearsals cannot be counted as a full contest because they do not preserve one lifecycle state end-to-end",
  );
}
if (!runtimeLibraryPresent) blockers.push("S14 local-only runtime library is missing");

if (V3_S14_SEED_CONTRACT.editionCount !== 1) blockers.push("S14 seed contract must contain exactly one edition");
if (V3_S14_SEED_CONTRACT.delegationCount !== 66) blockers.push("S14 seed contract must contain exactly 66 delegations");
if (V3_S14_SEED_CONTRACT.minimumShowCount < 2) blockers.push("S14 seed contract must contain multiple shows");
if (!V3_S14_SEED_CONTRACT.deterministic) blockers.push("S14 seed contract must be deterministic");
if (!V3_S14_SEED_CONTRACT.bounded) blockers.push("S14 seed contract must be bounded and must not clone production");

const implementationAssets = new Set([
  ...V3_S14_STAGES.map((item) => item.implementationAsset),
  ...V3_S14_INVARIANTS.map((item) => item.implementationAsset),
  ...V3_S14_FAILURE_INJECTIONS.map((item) => item.implementationAsset),
]);
const existingImplementationSources = [...implementationAssets]
  .filter((path) => existsSync(path))
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));
const allImplementationSource = [driverSource, runtimeSource, ...existingImplementationSources.map((item) => item.source)].join("\n");

const seedNeedles: Record<(typeof V3_S14_SEED_CONTRACT.requiredDomains)[number], readonly string[]> = {
  "entries/media": ["participants", "media"],
  "confirmation rounds": ["submission_rounds"],
  jury: ["jury_voting_windows"],
  televote: ["televoting.rounds"],
  results: ["results"],
  stories: ["studio2_storylines"],
  rules: ["ssc_rulebook_releases"],
  "fan users": ["fan_profiles"],
  organizers: ["studio2_role_assignments"],
};
for (const domain of V3_S14_SEED_CONTRACT.requiredDomains) {
  const missing = seedNeedles[domain].filter(
    (needle) => !allImplementationSource.toLowerCase().includes(needle.toLowerCase()),
  );
  if (missing.length) blockers.push(`S14 stateful seed has no concrete evidence for ${domain}: ${missing.join(", ")}`);
}

function enforceImplementedAsset(
  kind: "stage" | "invariant" | "failure injection",
  item: { id: string; implementationState: string; implementationAsset: string; driverMarker: string },
) {
  if (item.implementationState !== "implemented") return;
  if (!existsSync(item.implementationAsset)) {
    blockers.push(`${kind} ${item.id} is classified implemented but ${item.implementationAsset} is missing`);
    return;
  }
  const source = readFileSync(item.implementationAsset, "utf8");
  if (!source.includes(item.driverMarker)) {
    blockers.push(`${kind} ${item.id} is classified implemented but marker ${item.driverMarker} is absent from ${item.implementationAsset}`);
  }
  if (kind === "stage" && !driverSource.includes(item.implementationAsset.split("/").at(-1) ?? item.implementationAsset)) {
    blockers.push(`${kind} ${item.id} is implemented but the unified driver does not source ${item.implementationAsset}`);
  }
}

for (const stage of V3_S14_STAGES) enforceImplementedAsset("stage", stage);
for (const invariant of V3_S14_INVARIANTS) enforceImplementedAsset("invariant", invariant);
for (const failure of V3_S14_FAILURE_INJECTIONS) enforceImplementedAsset("failure injection", failure);

const incompleteStages = V3_S14_STAGES.filter((item) => item.implementationState !== "implemented");
if (incompleteStages.length) {
  blockers.push(`S14 lifecycle stages not implemented in the unified stateful driver: ${incompleteStages.map((item) => item.id).join(", ")}`);
}
const incompleteInvariants = V3_S14_INVARIANTS.filter((item) => item.implementationState !== "implemented");
if (incompleteInvariants.length) blockers.push(`S14 invariant checks not implemented: ${incompleteInvariants.map((item) => item.id).join(", ")}`);
const incompleteFailures = V3_S14_FAILURE_INJECTIONS.filter((item) => item.implementationState !== "implemented");
if (incompleteFailures.length) blockers.push(`S14 failure injections not implemented: ${incompleteFailures.map((item) => item.id).join(", ")}`);

if (unifiedDriverPresent && runtimeLibraryPresent) {
  for (const safetyMarker of [
    "check-v3-production-isolation.ts",
    "V3_CANDIDATE_SHA",
    "refusing S14 against non-local API_URL",
  ]) {
    if (!runtimeSource.includes(safetyMarker)) blockers.push(`S14 runtime safety contract missing marker: ${safetyMarker}`);
  }
  for (const completeMarker of [
    "s14-full-contest.partial.json",
    "s14-full-contest.json",
    "assert_same_persistent_contest",
    "S14_RESULTS_RUNTIME_RECONCILIATION_COMPLETE",
    "run_stage stage-10-archive run_s14_stage_10_archive",
    "write_final_evidence",
    '"passed": True',
    '"partial": False',
  ]) {
    if (!driverSource.includes(completeMarker)) blockers.push(`S14 complete-evidence contract missing marker: ${completeMarker}`);
  }
  if (allImplementationSource.includes("supabase.co")) blockers.push("S14 harness contains a hosted Supabase endpoint");
}

const ready = blockers.length === 0;
const report = {
  schemaVersion: 3,
  ready,
  releaseReady: false,
  releaseRisks,
  lifecycle,
  negativeCases,
  seedContract: V3_S14_SEED_CONTRACT,
  stages: V3_S14_STAGES,
  invariants: V3_S14_INVARIANTS,
  failureInjections: V3_S14_FAILURE_INJECTIONS,
  focusedLocalAssets: focusedLocalAssets.map((path) => ({ path, present: existsSync(path) })),
  criticalPublic: publicRequired.map((id) => ({ id, status: publicStatus.get(id) ?? "unregistered" })),
  criticalOrganizer: organizerRequired.map((id) => ({ id, status: organizerStatus.get(id) ?? "unregistered" })),
  relevantConsequences: relevantConsequences.map((item) => ({ eventType: item.eventType, implementationState: item.implementationState })),
  unifiedDriver,
  unifiedDriverPresent,
  runtimeLibrary,
  runtimeLibraryPresent,
  blockers,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`S14 full-contest rehearsal readiness: ${ready ? "READY" : "NOT READY"}\n`);
  process.stdout.write(`Lifecycle coverage required (${lifecycle.length}): ${lifecycle.join(" -> ")}\n`);
  process.stdout.write(`Negative cases required (${negativeCases.length}): ${negativeCases.join("; ")}\n`);
  process.stdout.write(`Canonical stages: ${V3_S14_STAGES.map((item) => `${item.id}=${item.implementationState}`).join(", ")}\n`);
  if (blockers.length) process.stdout.write(`Blockers:\n- ${blockers.join("\n- ")}\n`);
}

if (requireReady && !ready) process.exit(1);
