import { existsSync } from "node:fs";
import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
} from "../src/lib/v3-capability-registry";

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
if (!existsSync(unifiedDriver)) {
  blockers.push(
    "unified S14 driver does not exist yet; focused rehearsals cannot be counted as a full contest because they do not preserve one lifecycle state end-to-end",
  );
}

const ready = blockers.length === 0;
const report = {
  schemaVersion: 1,
  ready,
  lifecycle,
  negativeCases,
  focusedLocalAssets: focusedLocalAssets.map((path) => ({ path, present: existsSync(path) })),
  criticalPublic: publicRequired.map((id) => ({ id, status: publicStatus.get(id) ?? "unregistered" })),
  criticalOrganizer: organizerRequired.map((id) => ({ id, status: organizerStatus.get(id) ?? "unregistered" })),
  relevantConsequences: relevantConsequences.map((item) => ({
    eventType: item.eventType,
    implementationState: item.implementationState,
  })),
  unifiedDriver,
  unifiedDriverPresent: existsSync(unifiedDriver),
  blockers,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`S14 full-contest rehearsal readiness: ${ready ? "READY" : "NOT READY"}\n`);
  process.stdout.write(`Lifecycle coverage required (${lifecycle.length}): ${lifecycle.join(" -> ")}\n`);
  process.stdout.write(`Negative cases required (${negativeCases.length}): ${negativeCases.join("; ")}\n`);
  if (blockers.length) process.stdout.write(`Blockers:\n- ${blockers.join("\n- ")}\n`);
}

if (requireReady && !ready) process.exit(1);
