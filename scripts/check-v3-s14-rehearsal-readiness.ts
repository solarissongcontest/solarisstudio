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

// Keep the older human-readable inventory because the completion dashboard and
// QA contract tests consume it. The canonical executable contract below is
// stricter and follows System V3 §§229–258 directly.
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
for (const id of publicRequired) {
  const status = publicStatus.get(id);
  if (!status || !["parity", "cutover", "retired"].includes(status)) {
    blockers.push(`critical Public capability ${id} is ${status ?? "unregistered"}, not at parity/cutover`);
  }
}

const organizerStatus = new Map(
  V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item.migrationStatus]),
);
for (const id of organizerRequired) {
  const status = organizerStatus.get(id);
  if (!status || !["parity", "cutover", "retired"].includes(status)) {
    blockers.push(`critical Organizer capability ${id} is ${status ?? "unregistered"}, not at parity/cutover`);
  }
}

const consequencePrefixes = ["confirmation.", "entry.", "media.", "jury.", "televote.", "result."];
const relevantConsequences = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((item) =>
  consequencePrefixes.some((prefix) => item.eventType.startsWith(prefix)),
);
const declarationOnly = relevantConsequences.filter((item) => item.implementationState !== "event-backed");
if (declarationOnly.length) {
  blockers.push(`${declarationOnly.length}/${relevantConsequences.length} critical lifecycle consequences are still declaration-only`);
}

const missingAssets = focusedLocalAssets.filter((path) => !existsSync(path));
if (missingAssets.length) blockers.push(`missing focused local rehearsal assets: ${missingAssets.join(", ")}`);

const unifiedDriver = ".github/scripts/v3-full-contest-rehearsal.sh";
const unifiedDriverPresent = existsSync(unifiedDriver);
const driverSource = unifiedDriverPresent ? readFileSync(unifiedDriver, "utf8") : "";
if (!unifiedDriverPresent) {
  blockers.push(
    "unified S14 driver does not exist yet; focused rehearsals cannot be counted as a full contest because they do not preserve one lifecycle state end-to-end",
  );
}

if (V3_S14_SEED_CONTRACT.editionCount !== 1) blockers.push("S14 seed contract must contain exactly one edition");
if (V3_S14_SEED_CONTRACT.delegationCount !== 66) blockers.push("S14 seed contract must contain exactly 66 delegations");
if (V3_S14_SEED_CONTRACT.minimumShowCount < 2) blockers.push("S14 seed contract must contain multiple shows");
if (!V3_S14_SEED_CONTRACT.deterministic) blockers.push("S14 seed contract must be deterministic");
if (!V3_S14_SEED_CONTRACT.bounded) blockers.push("S14 seed contract must be bounded and must not clone production");

for (const domain of V3_S14_SEED_CONTRACT.requiredDomains) {
  const sourceNeedle = domain === "entries/media" ? "participants" : domain;
  if (unifiedDriverPresent && !driverSource.toLowerCase().includes(sourceNeedle.toLowerCase())) {
    blockers.push(`S14 driver has no seed/setup evidence for required domain: ${domain}`);
  }
}

const incompleteStages = V3_S14_STAGES.filter((item) => item.implementationState !== "implemented");
for (const stage of V3_S14_STAGES) {
  if (stage.implementationState === "implemented" && !driverSource.includes(stage.driverMarker)) {
    blockers.push(`${stage.id} is classified implemented but driver marker ${stage.driverMarker} is absent`);
  }
}
if (incompleteStages.length) {
  blockers.push(`S14 lifecycle stages not implemented in the unified stateful driver: ${incompleteStages.map((item) => item.id).join(", ")}`);
}

const incompleteInvariants = V3_S14_INVARIANTS.filter((item) => item.implementationState !== "implemented");
for (const invariant of V3_S14_INVARIANTS) {
  if (invariant.implementationState === "implemented" && !driverSource.includes(invariant.driverMarker)) {
    blockers.push(`${invariant.id} is classified implemented but driver marker ${invariant.driverMarker} is absent`);
  }
}
if (incompleteInvariants.length) {
  blockers.push(`S14 invariant checks not implemented: ${incompleteInvariants.map((item) => item.id).join(", ")}`);
}

const incompleteFailures = V3_S14_FAILURE_INJECTIONS.filter((item) => item.implementationState !== "implemented");
for (const failure of V3_S14_FAILURE_INJECTIONS) {
  if (failure.implementationState === "implemented" && !driverSource.includes(failure.driverMarker)) {
    blockers.push(`${failure.id} is classified implemented but driver marker ${failure.driverMarker} is absent`);
  }
}
if (incompleteFailures.length) {
  blockers.push(`S14 failure injections not implemented: ${incompleteFailures.map((item) => item.id).join(", ")}`);
}

if (unifiedDriverPresent) {
  for (const safetyMarker of [
    "check-v3-production-isolation.ts",
    "V3_CANDIDATE_SHA",
    "refusing S14 against non-local API_URL",
    "s14-full-contest.partial.json",
  ]) {
    if (!driverSource.includes(safetyMarker)) blockers.push(`S14 driver safety contract missing marker: ${safetyMarker}`);
  }
  if (driverSource.includes("https://") && driverSource.includes("supabase.co")) {
    blockers.push("S14 driver contains a hosted Supabase endpoint");
  }
}

const ready = blockers.length === 0;
const report = {
  schemaVersion: 2,
  ready,
  lifecycle,
  negativeCases,
  seedContract: V3_S14_SEED_CONTRACT,
  stages: V3_S14_STAGES,
  invariants: V3_S14_INVARIANTS,
  failureInjections: V3_S14_FAILURE_INJECTIONS,
  focusedLocalAssets: focusedLocalAssets.map((path) => ({ path, present: existsSync(path) })),
  criticalPublic: publicRequired.map((id) => ({ id, status: publicStatus.get(id) ?? "unregistered" })),
  criticalOrganizer: organizerRequired.map((id) => ({ id, status: organizerStatus.get(id) ?? "unregistered" })),
  relevantConsequences: relevantConsequences.map((item) => ({
    eventType: item.eventType,
    implementationState: item.implementationState,
  })),
  unifiedDriver,
  unifiedDriverPresent,
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
