import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
  V3_SYSTEM_DOMAIN_REGISTRY,
} from "./v3-capability-registry";
import { assessV3S16AuthorizationReadiness } from "./v3-s16-authorization-readiness";

export function assessV3S16StaticReleaseReadiness() {
  const authorization = assessV3S16AuthorizationReadiness();
  const publicCutoverRemaining = V3_PUBLIC_CAPABILITIES.filter(
    (item) => !["cutover", "retired"].includes(item.specificationStatus),
  ).length;
  const organizerCutoverRemaining = V3_ORGANIZER_CAPABILITY_REGISTRY.filter(
    (item) => !["cutover", "retired"].includes(item.migrationStatus),
  ).length;
  const pendingPhysicalDomains = V3_SYSTEM_DOMAIN_REGISTRY.filter(
    (item) => item.physicalAuditStatus === "pending",
  ).length;
  const declarationOnlyConsequences = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(
    (item) => item.implementationState !== "event-backed",
  ).length;
  const publicParityMissingEvidence = V3_PUBLIC_CAPABILITIES.filter(
    (item) =>
      ["parity", "cutover", "retired"].includes(item.specificationStatus) &&
      !("migrationEvidence" in item && item.migrationEvidence?.trim()),
  ).length;

  const blockers: string[] = [];
  if (!authorization.ready) {
    blockers.push(
      `authorization readiness incomplete: ${authorization.knownGapCount} known gaps, ${authorization.incompleteVerifiedCommands.length} incomplete verified commands`,
    );
  }
  if (publicCutoverRemaining) {
    blockers.push(`${publicCutoverRemaining} Public capabilities are not cutover/retired`);
  }
  if (organizerCutoverRemaining) {
    blockers.push(`${organizerCutoverRemaining} Organizer capabilities are not cutover/retired`);
  }
  if (pendingPhysicalDomains) {
    blockers.push(`${pendingPhysicalDomains} System physical ownership audits are pending`);
  }
  if (declarationOnlyConsequences) {
    blockers.push(`${declarationOnlyConsequences} domain consequences are not event-backed`);
  }
  if (publicParityMissingEvidence) {
    blockers.push(
      `${publicParityMissingEvidence} parity/cutover/retired Public capabilities lack migration evidence`,
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
    authorization,
    publicCutoverRemaining,
    organizerCutoverRemaining,
    pendingPhysicalDomains,
    declarationOnlyConsequences,
    publicParityMissingEvidence,
  } as const;
}

export type V3S16StaticReleaseReadiness = ReturnType<
  typeof assessV3S16StaticReleaseReadiness
>;
