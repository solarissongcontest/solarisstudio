import { V3_DOMAIN_CONSEQUENCE_REGISTRY } from "./v3-domain-consequence-registry";
import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import { V3_PUBLIC_CAPABILITY_REGISTRY, type PublicCapabilityMigration } from "./v3-public-capability-registry";
import { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";

const V3_PUBLIC_CAPABILITIES = [
  ...V3_PUBLIC_CAPABILITY_REGISTRY,
  ...V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES,
] as const;

type PublicReadinessStage =
  | "Foundation work underway"
  | "Core systems taking shape"
  | "Core experience taking shape"
  | "Polishing and verification"
  | "Final verification in progress";

export type TerraOsPublicReadiness = {
  percent: number;
  stage: PublicReadinessStage;
};

const PUBLIC_STATUS_SCORE: Record<
  PublicCapabilityMigration["specificationStatus"],
  number
> = {
  discovered: 0.05,
  mapped: 0.18,
  specified: 0.28,
  building: 0.55,
  parity: 0.82,
  cutover: 0.96,
  retired: 1,
};

const ORGANIZER_STATUS_SCORE: Record<
  (typeof V3_ORGANIZER_CAPABILITY_REGISTRY)[number]["migrationStatus"],
  number
> = {
  planned: 0.12,
  building: 0.55,
  parity: 0.82,
  cutover: 0.96,
  retired: 1,
};

function average(values: readonly number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function publicScore(
  predicate: (item: (typeof V3_PUBLIC_CAPABILITIES)[number]) => boolean,
) {
  const selected = V3_PUBLIC_CAPABILITIES.filter(predicate);
  return average(
    selected.map((item) => {
      const base = PUBLIC_STATUS_SCORE[item.specificationStatus];
      if (
        ["parity", "cutover", "retired"].includes(item.specificationStatus) &&
        !("migrationEvidence" in item && Boolean(item.migrationEvidence))
      ) {
        // A high migration state without attached evidence should not make the
        // public readiness meter look more certain than the canonical registry.
        return Math.min(base, 0.72);
      }
      return base;
    }),
  );
}

function organizerScore(
  predicate: (item: (typeof V3_ORGANIZER_CAPABILITY_REGISTRY)[number]) => boolean,
) {
  return average(
    V3_ORGANIZER_CAPABILITY_REGISTRY.filter(predicate).map(
      (item) => ORGANIZER_STATUS_SCORE[item.migrationStatus],
    ),
  );
}

function stageFor(percent: number): PublicReadinessStage {
  if (percent < 25) return "Foundation work underway";
  if (percent < 50) return "Core systems taking shape";
  if (percent < 70) return "Core experience taking shape";
  if (percent < 90) return "Polishing and verification";
  return "Final verification in progress";
}

/**
 * Public, deliberately coarse TerraOS readiness projection.
 *
 * It is computed only from canonical V3 registries that ship with the deployed
 * source. A meaningful registry change merged into the deployed revision can
 * move the score in either direction. PR counts, commit counts, dates and
 * elapsed time never affect the percentage.
 *
 * The returned object intentionally contains no internal evidence, identifiers,
 * deployment metadata, CI state, database details or blocker descriptions. The
 * maintenance page may expose only this sanitized projection.
 */
export function getTerraOsPublicReadiness(): TerraOsPublicReadiness {
  const shellAndNavigation = publicScore((item) =>
    ["home", "explore", "live", "auth"].includes(item.targetArea),
  );

  const participation = publicScore(
    (item) => item.targetArea === "participate",
  );

  const publicProduct = publicScore((item) =>
    ["home", "explore", "results", "me", "live", "contextual"].includes(
      item.targetArea,
    ),
  );

  const organizerCritical = organizerScore((item) =>
    [
      "overview",
      "tasks-operations",
      "delegations",
      "voting-results",
      "live-production",
      "contest",
      "communications",
    ].includes(item.targetDomain),
  );

  const verifiedDomains = average(
    V3_SYSTEM_DOMAIN_REGISTRY.map((domain) =>
      domain.physicalAuditStatus === "verified" ? 1 : 0,
    ),
  );
  const eventBackedConsequences = average(
    V3_DOMAIN_CONSEQUENCE_REGISTRY.map((consequence) =>
      consequence.implementationState === "event-backed" ? 1 : 0,
    ),
  );
  const reliability = average([verifiedDomains, eventBackedConsequences]);

  // V3 parity is defined as product parity, not merely component existence, so
  // the proportion at parity-or-beyond is a conservative proxy for the polish
  // work that includes responsive/accessibility acceptance.
  const polish = average(
    V3_PUBLIC_CAPABILITIES.map((item) =>
      ["parity", "cutover", "retired"].includes(item.specificationStatus)
        ? 1
        : item.specificationStatus === "building"
          ? 0.45
          : 0,
    ),
  );

  const releaseVerification = average([
    average(
      V3_PUBLIC_CAPABILITIES.map((item) =>
        ["cutover", "retired"].includes(item.specificationStatus) ? 1 : 0,
      ),
    ),
    average(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) =>
        ["cutover", "retired"].includes(item.migrationStatus) ? 1 : 0,
      ),
    ),
  ]);

  const raw =
    shellAndNavigation * 15 +
    participation * 20 +
    publicProduct * 15 +
    organizerCritical * 15 +
    reliability * 15 +
    polish * 10 +
    releaseVerification * 10;

  // The maintenance surface must never publicly claim 100% readiness while it
  // is still the active public surface. The actual release gate remains the
  // authority for taking maintenance down.
  const percent = Math.max(0, Math.min(98, Math.round(raw)));

  return {
    percent,
    stage: stageFor(percent),
  };
}
