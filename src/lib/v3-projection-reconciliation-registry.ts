import { V3_DOMAIN_CONSEQUENCE_REGISTRY, isV3ReadOnlyConsequenceReplacement, v3DomainConsequence } from "./v3-domain-consequence-registry";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";

export type V3ProjectionFreshnessClass = "static" | "normal" | "operational" | "live";
export type V3ProjectionRepairState = "declared" | "foundation" | "rebuildable" | "verified";
export type V3ProjectionRepairScope = "global" | "edition" | "show" | "actor" | "operation";

export type V3ProjectionRepairContract = {
  state: V3ProjectionRepairState;
  scope: V3ProjectionRepairScope;
  incrementalPath: string | null;
  rebuildPath: string | null;
  verificationPath: string | null;
  boundedBy: string | null;
  explicitFailureState: string;
  evidence: readonly string[];
};

export type V3ProjectionReconciliation = {
  projection: string;
  canonicalDomains: readonly string[];
  invalidatingEvents: readonly string[];
  freshnessClass: V3ProjectionFreshnessClass;
  repair: V3ProjectionRepairContract;
};

const LIVE_DOMAINS = new Set(["live-show", "televote"]);
const OPERATIONAL_DOMAINS = new Set([
  "participation",
  "confirmation",
  "entry",
  "media",
  "jury",
  "results",
  "publication",
  "notification",
  "task",
  "receipt",
  "system-job",
  "incident",
  "permissions",
  "membership",
]);
const STATIC_DOMAINS = new Set(["rules"]);

const DOMAIN_REPAIR_CONTRACTS: Readonly<Record<string, V3ProjectionRepairContract>> = {
  activity: {
    state: "rebuildable",
    scope: "actor",
    incrementalPath: "Read current canonical completed operation ledgers; no writable activity cache exists.",
    rebuildPath: "public.v3_my_participant_activity(before,limit,before_operation_id)",
    verificationPath: "Compare recipient operation identity, source event and reconciliation state with canonical ledger/version truth.",
    boundedBy: "authenticated recipient; at most 50 rows per keyset page",
    explicitFailureState: "DATABASE",
    evidence: [
      "supabase/migrations/20261019213500_v3_participant_activity_projection.sql",
      ".github/scripts/v3-participant-activity-regression.sh",
      ".github/tests/v3-participant-activity.sql",
      "src/lib/v3-activity-projection-consequence.test.ts",
    ],
  },
  task: {
    state: "rebuildable",
    scope: "edition",
    incrementalPath: "Domain events re-evaluate domain-backed task truth.",
    rebuildPath: "private.studio2_reconcile_all_organizer_tasks(edition_id)",
    verificationPath: "Compare projected tasks with canonical domain task sources for the same edition.",
    boundedBy: "one edition per reconciliation invocation",
    explicitFailureState: "reconciliation_required",
    evidence: [
      "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
      "supabase/migrations/20261015201221_v3_s5_entry_consequences.sql",
      "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
    ],
  },
  receipt: {
    state: "rebuildable",
    scope: "operation",
    incrementalPath: "Operation completion writes the canonical durable receipt.",
    rebuildPath: "public.studio2_reconcile_operation(operation_id)",
    verificationPath: "Resolve the exact operation receipt and normalize its authoritative state.",
    boundedBy: "one operation id per reconciliation invocation",
    explicitFailureState: "reconciliation_required",
    evidence: [
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
      "src/lib/system-operation-reconciliation.server.ts",
      "src/lib/system-operation-reconciliation.server.test.ts",
    ],
  },
  entry: {
    state: "rebuildable",
    scope: "edition",
    incrementalPath: "Canonical Entry commands and S5 events invalidate Entry consumers.",
    rebuildPath: "reconcileConfirmationEditionToSolarisInternal(editionId,{offset,limit})",
    verificationPath: "verifyConfirmationEditionProjectionInternal(editionId)",
    boundedBy:
      "one edition per wave; at most 50 Confirmation submissions per repair invocation and 500 rows per full verification",
    explicitFailureState: "reconciliation_required",
    evidence: [
      "supabase/migrations/20261011161500_reconcile_confirmation_entry_projection.sql",
      "src/integrations/confirmations/reconcile.server.ts",
      "src/lib/v3-s6-confirmation-entry-reconciliation.test.ts",
    ],
  },
  confirmation: {
    state: "foundation",
    scope: "edition",
    incrementalPath:
      "Canonical submission writes invoke private.studio2_reconcile_confirmation_requirement; confirmation.submitted/window_changed drive downstream task and notification reconciliation.",
    rebuildPath:
      "public.studio2_reconcile_confirmation_requirements(edition_id,offset,limit)",
    verificationPath:
      "public.studio2_verify_confirmation_requirements(edition_id,limit)",
    boundedBy:
      "one edition per wave; at most 50 country invariants per repair invocation and 500 candidates per repair/verification boundary",
    explicitFailureState: "canonical_confirmation_recovery_required",
    evidence: [
      "supabase/migrations/20261002235000_organisation_os_v5_confirmation_requirements.sql",
      "supabase/migrations/20261015183000_v3_s5_confirmation_consequences.sql",
      "supabase/migrations/20261018053000_v3_s6_confirmation_requirement_reconciliation.sql",
      "src/lib/v3-s6-confirmation-requirement-reconciliation.contract.test.ts",
      "supabase/migrations/20261024200300_v3_s6_confirmation_requirement_bounded_repair.sql",
      ".github/scripts/v3-s5-confirmation-consequences-rehearsal.sh",
      "src/lib/v3-s6-confirmation-requirement-repair.contract.test.ts",
    ],
  },
  notification: {
    state: "rebuildable",
    scope: "actor",
    incrementalPath:
      "Domain notification consumers and the global enqueue sweep use the shared server-owned candidate engine with stable user/dedupe-key idempotency.",
    rebuildPath:
      "public.studio2_reconcile_notification_delivery_projection(user_id, now, limit)",
    verificationPath:
      "public.studio2_verify_notification_delivery_projection(user_id, now, limit)",
    boundedBy:
      "one recipient per repair; at most 100 expected/stale rows per repair and 500 expected-plus-pending rows per verification",
    explicitFailureState: "delivery_reconciliation_required",
    evidence: [
      "supabase/migrations/20260929214500_solaris_app_push_foundation.sql",
      "supabase/migrations/20261003003000_organisation_os_v5_task_notifications.sql",
      "supabase/migrations/20261019113000_v3_s6_notification_reconciliation.sql",
      "src/lib/v3-s6-notification-reconciliation.contract.test.ts",
    ],
  },
};

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function freshnessFor(domains: readonly string[]): V3ProjectionFreshnessClass {
  if (domains.some((domain) => LIVE_DOMAINS.has(domain))) return "live";
  if (domains.some((domain) => OPERATIONAL_DOMAINS.has(domain))) return "operational";
  if (domains.length > 0 && domains.every((domain) => STATIC_DOMAINS.has(domain))) return "static";
  return "normal";
}

function repairFor(domains: readonly string[]): V3ProjectionRepairContract {
  const contracts = domains
    .map((domain) => DOMAIN_REPAIR_CONTRACTS[domain])
    .filter((contract): contract is V3ProjectionRepairContract => Boolean(contract));

  if (contracts.length === 1) return contracts[0];
  if (contracts.length > 1) {
    return {
      state: contracts.every((contract) => contract.state === "verified")
        ? "verified"
        : contracts.every((contract) => ["rebuildable", "verified"].includes(contract.state))
          ? "rebuildable"
          : "foundation",
      scope: contracts.every((contract) => contract.scope === contracts[0].scope)
        ? contracts[0].scope
        : "global",
      incrementalPath: contracts.map((contract) => contract.incrementalPath).filter(Boolean).join(" + ") || null,
      rebuildPath: contracts.every((contract) => contract.rebuildPath)
        ? contracts.map((contract) => contract.rebuildPath).join(" + ")
        : null,
      verificationPath: contracts.every((contract) => contract.verificationPath)
        ? contracts.map((contract) => contract.verificationPath).join(" + ")
        : null,
      boundedBy: contracts.every((contract) => contract.boundedBy)
        ? contracts.map((contract) => contract.boundedBy).join(" + ")
        : null,
      explicitFailureState: "reconciliation_required",
      evidence: uniqueSorted(contracts.flatMap((contract) => contract.evidence)),
    };
  }

  return {
    state: "declared",
    scope: "global",
    incrementalPath: null,
    rebuildPath: null,
    verificationPath: null,
    boundedBy: null,
    explicitFailureState: "reconciliation_required",
    evidence: [],
  };
}

const projectionOwners = new Map<string, Set<string>>();
for (const domain of V3_SYSTEM_DOMAIN_REGISTRY) {
  for (const projection of domain.projections) {
    const owners = projectionOwners.get(projection) ?? new Set<string>();
    owners.add(domain.domain);
    projectionOwners.set(projection, owners);
  }
}

export const V3_PROJECTION_RECONCILIATION_REGISTRY: readonly V3ProjectionReconciliation[] =
  [...projectionOwners.entries()]
    .map(([projection, ownerSet]) => {
      const canonicalDomains = uniqueSorted([...ownerSet]);
      const invalidatingEvents = uniqueSorted(
        V3_SYSTEM_DOMAIN_REGISTRY
          .filter((domain) => canonicalDomains.includes(domain.domain))
          .flatMap((domain) => domain.domain === "activity"
            // The derived read is refreshed by source truth, never by reading itself.
            ? ["confirmation.submitted", "entry.version_changed", "jury.ballot_changed", "televote.ballot_submitted"]
            : domain.eventTypes)
          .filter((eventType) => {
            const consequence = v3DomainConsequence(eventType);
            return !consequence || !isV3ReadOnlyConsequenceReplacement(consequence);
          }),
      );
      return {
        projection,
        canonicalDomains,
        invalidatingEvents,
        freshnessClass: freshnessFor(canonicalDomains),
        repair: repairFor(canonicalDomains),
      } satisfies V3ProjectionReconciliation;
    })
    .sort((left, right) => left.projection.localeCompare(right.projection));

export function v3ProjectionReconciliation(projection: string) {
  return V3_PROJECTION_RECONCILIATION_REGISTRY.find((item) => item.projection === projection) ?? null;
}

export function v3ProjectionsInvalidatedByEvent(eventType: string) {
  const consequence = V3_DOMAIN_CONSEQUENCE_REGISTRY.find((item) => item.eventType === eventType);
  if (!consequence || isV3ReadOnlyConsequenceReplacement(consequence)) return [] as V3ProjectionReconciliation[];

  const declared = new Set([
    ...consequence.projections,
    ...consequence.realtimeEffects.map((effect) => effect.projection),
  ]);
  return V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
    projection.invalidatingEvents.includes(eventType) || declared.has(projection.projection),
  );
}

export function validateV3ProjectionReconciliationRegistry() {
  const errors: string[] = [];
  const knownDomains = new Set(V3_SYSTEM_DOMAIN_REGISTRY.map((domain) => domain.domain));
  const knownEvents = new Set(V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.eventTypes));
  const expectedProjections = new Set(V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.projections));
  const seen = new Set<string>();

  for (const projection of V3_PROJECTION_RECONCILIATION_REGISTRY) {
    if (seen.has(projection.projection)) errors.push(`duplicate projection ${projection.projection}`);
    seen.add(projection.projection);
    if (!projection.canonicalDomains.length) errors.push(`${projection.projection} has no canonical domain`);
    for (const domain of projection.canonicalDomains) {
      if (!knownDomains.has(domain)) errors.push(`${projection.projection} has unknown canonical domain ${domain}`);
    }
    for (const eventType of projection.invalidatingEvents) {
      if (!knownEvents.has(eventType)) errors.push(`${projection.projection} has unknown invalidating event ${eventType}`);
    }
    if (projection.freshnessClass === "live" && projection.invalidatingEvents.length === 0) {
      errors.push(`${projection.projection} is live but has no invalidating event`);
    }
    if (["rebuildable", "verified"].includes(projection.repair.state)) {
      if (!projection.repair.rebuildPath) errors.push(`${projection.projection} claims rebuildability without a rebuild path`);
      if (!projection.repair.verificationPath) errors.push(`${projection.projection} claims rebuildability without verification`);
      if (!projection.repair.boundedBy) errors.push(`${projection.projection} claims rebuildability without a bound`);
      if (!projection.repair.evidence.length) errors.push(`${projection.projection} claims rebuildability without evidence`);
    }
  }

  for (const projection of expectedProjections) {
    if (!seen.has(projection)) errors.push(`unregistered projection ${projection}`);
  }
  for (const projection of seen) {
    if (!expectedProjections.has(projection)) errors.push(`orphan projection ${projection}`);
  }

  return errors;
}
