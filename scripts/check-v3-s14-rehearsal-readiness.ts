import { execFileSync } from "node:child_process";
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

let archiveTransitionContract: {
  ready: boolean;
  blockers: string[];
  requirements?: unknown;
} = { ready: false, blockers: ["archive-contract-check-failed"] };
try {
  archiveTransitionContract = JSON.parse(
    execFileSync("bun", ["run", "scripts/check-v3-s14-archive-contract.ts", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as typeof archiveTransitionContract;
} catch (error) {
  blockers.push(`S14 Archive transition contract checker failed: ${String(error)}`);
}
if (!archiveTransitionContract.ready) {
  blockers.push(
    `S14 Archive transition is blocked until the System-owned edition command has reviewed-version, operation/idempotency and reconciliation semantics: ${archiveTransitionContract.blockers.join(", ")}`,
  );
}

if (unifiedDriverPresent && runtimeLibraryPresent) {
  for (const safetyMarker of [
    "check-v3-production-isolation.ts",
    "V3_CANDIDATE_SHA",
    "refusing S14 against non-local API_URL",
  ]) {
    if (!runtimeSource.includes(safetyMarker)) blockers.push(`S14 runtime safety contract missing marker: ${safetyMarker}`);
  }
  if (!driverSource.includes("s14-full-contest.partial.json")) blockers.push("S14 driver does not emit explicit partial-state evidence while incomplete");
  if (!driverSource.includes("No release-grade s14-full-contest.json was written")) blockers.push("S14 driver does not explicitly fail closed against premature release evidence");
  if (allImplementationSource.includes("supabase.co")) blockers.push("S14 harness contains a hosted Supabase endpoint");
}

const ready = blockers.length === 0;
const report = {
  schemaVersion: 3,
  ready,
  lifecycle,
  negativeCases,
  seedContract: V3_S14_SEED_CONTRACT,
  stages: V3_S14_STAGES,
  invariants: V3_S14_INVARIANTS,
  failureInjections: V3_S14_FAILURE_INJECTIONS,
  archiveTransitionContract,
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
  process.stdout.write(`Archive transition contract: ${archiveTransitionContract.ready ? "READY" : `BLOCKED (${archiveTransitionContract.blockers.join(", ")})`}\n`);
  if (blockers.length) process.stdout.write(`Blockers:\n- ${blockers.join("\n- ")}\n`);
}

if (requireReady && !ready) process.exit(1);
