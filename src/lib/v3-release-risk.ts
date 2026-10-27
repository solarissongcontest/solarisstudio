import { classifyV3ConsequenceRelease, type V3ConsequenceReleaseClass } from "./v3-consequence-release-classification";

export const V3_RELEASE_RISK_CLASSES = [
  "hard_blocker",
  "conditional_blocker",
  "tracked_migration_debt",
  "obsolete_or_replaced",
] as const;

export type V3ReleaseRiskClass = (typeof V3_RELEASE_RISK_CLASSES)[number];

export type V3ReleaseInventoryItem = {
  exactFinding: string;
  classification?: string;
  canonicalId?: string;
  domain?: string;
  rationale?: string;
  requiredRepair?: readonly string[];
  replacement?: unknown;
};

export type V3ReleaseRiskFinding = {
  finding: string;
  releaseRisk: V3ReleaseRiskClass;
  rule: string;
  rationale: string;
  consequenceClass?: V3ConsequenceReleaseClass;
};

export type V3ReleaseRiskReport = {
  schemaVersion: 1;
  policyVersion: "v3-release-doctrine-1";
  unresolvedTotal: number;
  totals: Record<V3ReleaseRiskClass, number>;
  findings: readonly V3ReleaseRiskFinding[];
  releaseBlockingCount: number;
  releaseRiskClassified: boolean;
};

const HARD_MUTATION_CAPABILITIES = new Set([
  "entry",
  "delegation-confirmation-responses",
  "voting-rounds-entries",
  "voting-public-results",
]);

const CRITICAL_PHYSICAL_DOMAINS = new Set([
  "results",
  "publication",
  "jury",
  "televote",
  "confirmation",
  "entry",
  "permissions",
  "membership",
  "session",
  "identity",
  "live-show",
  "voting-configuration",
  "integrity",
]);

function emptyTotals(): Record<V3ReleaseRiskClass, number> {
  return {
    hard_blocker: 0,
    conditional_blocker: 0,
    tracked_migration_debt: 0,
    obsolete_or_replaced: 0,
  };
}

function consequenceEventType(finding: string) {
  const match = /^DOMAIN_CONSEQUENCE_DECLARED\s+([^\s]+)/.exec(finding);
  return match?.[1] ?? null;
}

function physicalDomain(finding: string) {
  return /^PHYSICAL_OWNER_PENDING\s+(.+)$/.exec(finding)?.[1]?.trim() ?? null;
}

function classifyConsequence(finding: string): V3ReleaseRiskFinding {
  const eventType = consequenceEventType(finding);
  if (!eventType) {
    return {
      finding,
      releaseRisk: "hard_blocker",
      rule: "fail_closed_unparseable_consequence",
      rationale: "An unresolved consequence finding could not be mapped to a stable event identity.",
    };
  }
  const consequenceClass = classifyV3ConsequenceRelease(eventType);
  if (consequenceClass === "integrity_critical") {
    return {
      finding,
      releaseRisk: "hard_blocker",
      rule: "integrity_consequence_incomplete",
      rationale: "Integrity-critical consequence maturity is incomplete and may affect official contest truth or access state.",
      consequenceClass,
    };
  }
  if (consequenceClass === "delivery_critical") {
    return {
      finding,
      releaseRisk: "conditional_blocker",
      rule: "delivery_consequence_scope_dependent",
      rationale: "Delivery-critical maturity blocks releases that require this delivery surface, but does not universally imply corrupt canonical state.",
      consequenceClass,
    };
  }
  return {
    finding,
    releaseRisk: "tracked_migration_debt",
    rule: consequenceClass === "observational_or_pure_read" ? "pure_read_no_integrity_ceremony" : "derived_consequence_debt",
    rationale: consequenceClass === "observational_or_pure_read"
      ? "Pure-read/observational effects do not require a fabricated event/outbox lifecycle."
      : "Derived consequence maturity remains visible debt but cannot corrupt canonical contest truth.",
    consequenceClass,
  };
}

function classifyInventoryFinding(
  finding: string,
  item: V3ReleaseInventoryItem | undefined,
): V3ReleaseRiskFinding {
  if (!item) {
    return {
      finding,
      releaseRisk: "hard_blocker",
      rule: "fail_closed_unclassified_inventory_finding",
      rationale: "The current scanner reported a finding absent from the complete migration inventory.",
    };
  }

  if (item.classification === "obsolete_replaced" || item.classification === "false_positive") {
    return {
      finding,
      releaseRisk: "obsolete_or_replaced",
      rule: "inventory_obsolete_or_replaced",
      rationale: "The complete inventory explicitly records this finding as obsolete/replaced rather than unfinished release authority.",
    };
  }

  const id = item.canonicalId ?? "";
  if (HARD_MUTATION_CAPABILITIES.has(id)) {
    return {
      finding,
      releaseRisk: "hard_blocker",
      rule: "known_critical_mutation_gap",
      rationale: "This capability owns a known critical mutation/canonical-authority gap and cannot be reduced to evidence debt.",
    };
  }

  if (item.classification === "implemented_evidence_missing") {
    return {
      finding,
      releaseRisk: "tracked_migration_debt",
      rule: "implementation_present_evidence_debt",
      rationale: "Repository source contains the intended implementation; the remaining inventory item is explicit acceptance/evidence debt unless another hard gate reports a real defect.",
    };
  }

  return {
    finding,
    releaseRisk: "conditional_blocker",
    rule: item.classification === "not_implemented" ? "required_scope_not_implemented" : "required_scope_partial_migration",
    rationale: item.classification === "not_implemented"
      ? "The required capability remains unimplemented and must be completed or explicitly excluded from the release scope."
      : "The capability is only partially migrated and blocks any release scope that requires it.",
  };
}

export function classifyV3ReleaseFinding(
  finding: string,
  inventoryItem?: V3ReleaseInventoryItem,
): V3ReleaseRiskFinding {
  if (finding.startsWith("STRUCTURAL_INTEGRITY ")) {
    return {
      finding,
      releaseRisk: "hard_blocker",
      rule: "structural_integrity_failure",
      rationale: "Canonical registry/integrity structure is invalid; release classification must fail closed.",
    };
  }
  if (finding.startsWith("DOMAIN_CONSEQUENCE_DECLARED ")) return classifyConsequence(finding);
  if (finding.startsWith("PARITY_EVIDENCE_MISSING ")) {
    return {
      finding,
      releaseRisk: "tracked_migration_debt",
      rule: "parity_evidence_debt",
      rationale: "Missing parity evidence remains auditable debt but does not by itself prove unsafe mutation authority.",
    };
  }
  if (finding.startsWith("PHYSICAL_OWNER_PENDING ")) {
    const domain = physicalDomain(finding);
    const hard = Boolean(domain && CRITICAL_PHYSICAL_DOMAINS.has(domain));
    return {
      finding,
      releaseRisk: hard ? "hard_blocker" : "conditional_blocker",
      rule: hard ? "critical_physical_authority_unproven" : "noncritical_physical_ownership_pending",
      rationale: hard
        ? "Physical ownership is unproven for an integrity-sensitive domain."
        : "Physical ownership remains required for the relevant release scope but is not itself evidence of a critical active writer.",
    };
  }
  if (finding.startsWith("PUBLIC_CUTOVER_UNRESOLVED ") || finding.startsWith("ORGANIZER_CUTOVER_UNRESOLVED ")) {
    return classifyInventoryFinding(finding, inventoryItem);
  }
  return {
    finding,
    releaseRisk: "hard_blocker",
    rule: "fail_closed_unknown_finding_family",
    rationale: "Unknown readiness finding families cannot silently become non-blocking.",
  };
}

export function buildV3ReleaseRiskReport(
  currentFindings: readonly string[],
  inventory: readonly V3ReleaseInventoryItem[],
): V3ReleaseRiskReport {
  const byFinding = new Map(inventory.map((item) => [item.exactFinding, item]));
  const findings = [...new Set(currentFindings)].sort().map((finding) =>
    classifyV3ReleaseFinding(finding, byFinding.get(finding)),
  );
  const totals = emptyTotals();
  for (const finding of findings) totals[finding.releaseRisk] += 1;
  return {
    schemaVersion: 1,
    policyVersion: "v3-release-doctrine-1",
    unresolvedTotal: findings.length,
    totals,
    findings,
    releaseBlockingCount: totals.hard_blocker + totals.conditional_blocker,
    releaseRiskClassified: findings.length === Object.values(totals).reduce((sum, value) => sum + value, 0),
  };
}
