import type { PublicCapabilityMigration } from "./v3-public-capability-registry";
import type { AdminCapabilityMigration } from "./v3-organizer-capability-registry";
import type { V3DomainConsequence } from "./v3-domain-consequence-registry";
import type { SystemDomainOwner } from "./v3-system-domain-registry";

/**
 * Generated action queue for unfinished V3 source-owned capabilities.
 *
 * This is deliberately a SOURCE REGISTRY inventory, not acceptance evidence:
 * routes, ownership labels, and migrations being present do not mean the
 * capability is implemented, safe, or ready for public release.
 */
type PublicInput = Pick<PublicCapabilityMigration,
  "id" | "specificationStatus" | "targetArea" | "targetRoute" |
  "backendOwners" | "acceptanceScenarioId"> & { migrationEvidence?: string };
type OrganizerInput = Pick<AdminCapabilityMigration,
  "legacyId" | "migrationStatus" | "targetDomain" | "targetRoute" | "ownerCapability">;
type ConsequenceInput = Pick<V3DomainConsequence, "eventType" | "ownerDomain" | "implementationState">;
type DomainInput = Pick<SystemDomainOwner, "domain" | "authoritativeService" | "physicalAuditStatus">;

export type V3CapabilityInventorySources = {
  publicCapabilities: readonly PublicInput[];
  organizerCapabilities: readonly OrganizerInput[];
  consequences: readonly ConsequenceInput[];
  systemDomains: readonly DomainInput[];
};

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) found.add(id);
    seen.add(id);
  }
  return [...found].sort();
}

function byId<T>(rows: readonly T[], identity: (row: T) => string): T[] {
  return [...rows].sort((left, right) => identity(left).localeCompare(identity(right)));
}

/** Pure, deterministic, self-contained inventory suitable for an exact-SHA dashboard. */
export function buildV3CapabilityGapInventory(input: V3CapabilityInventorySources) {
  const publicUnresolved = byId(input.publicCapabilities.filter(
    (item) => !["cutover", "retired"].includes(item.specificationStatus),
  ), item => item.id).map(item => ({
    id: item.id,
    status: item.specificationStatus,
    targetArea: item.targetArea,
    targetRoute: item.targetRoute,
    backendOwners: [...item.backendOwners].sort(),
    acceptanceScenarioId: item.acceptanceScenarioId,
    hasMigrationEvidenceReference: Boolean(item.migrationEvidence?.trim()),
  }));
  const organizerUnresolved = byId(input.organizerCapabilities.filter(
    (item) => !["cutover", "retired"].includes(item.migrationStatus),
  ), item => item.legacyId).map(item => ({
    id: item.legacyId,
    status: item.migrationStatus,
    targetDomain: item.targetDomain,
    targetRoute: item.targetRoute,
    ownerCapability: item.ownerCapability,
  }));
  const consequencesUnresolved = byId(input.consequences.filter(
    (item) => item.implementationState !== "event-backed",
  ), item => item.eventType).map(item => ({
    eventType: item.eventType,
    ownerDomain: item.ownerDomain,
    state: item.implementationState,
  }));
  const pendingPhysical = byId(input.systemDomains.filter(
    (item) => item.physicalAuditStatus !== "verified",
  ), item => item.domain).map(item => ({
    domain: item.domain,
    authoritativeService: item.authoritativeService,
    status: item.physicalAuditStatus,
  }));

  return {
    schemaVersion: 1 as const,
    source: "canonical-v3-source-registries" as const,
    scanned: {
      publicCapabilities: input.publicCapabilities.length,
      organizerCapabilities: input.organizerCapabilities.length,
      consequences: input.consequences.length,
      systemDomains: input.systemDomains.length,
    },
    unresolved: {
      publicCapabilities: publicUnresolved,
      organizerCapabilities: organizerUnresolved,
      consequences: consequencesUnresolved,
      physicalOwnership: pendingPhysical,
    },
    duplicateIdentifiers: {
      publicCapabilities: duplicates(input.publicCapabilities.map(item => item.id)),
      organizerCapabilities: duplicates(input.organizerCapabilities.map(item => item.legacyId)),
      consequences: duplicates(input.consequences.map(item => item.eventType)),
      systemDomains: duplicates(input.systemDomains.map(item => item.domain)),
    },
    caution: "Registry states and source files are not independent functional, hosted-schema, or release-certification evidence.",
  };
}
