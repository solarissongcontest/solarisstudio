import { v3SystemDomain } from "./v3-system-domain-registry";

export type V3DependencySeverity = "blocking" | "advisory";

export type V3DependencyCondition = {
  id: string;
  domain: string;
  description: string;
  severity: V3DependencySeverity;
  /** Machine-facing semantic condition, not executable SQL. */
  condition: string;
};

export type V3WorkflowDependency = {
  operation: string;
  ownerDomain: string;
  requires: readonly V3DependencyCondition[];
  blocks: readonly string[];
  produces: readonly string[];
  evidence: readonly string[];
  implementationState: "declared" | "enforced";
};

/**
 * Cross-domain prerequisite registry required by System V3 S1.
 *
 * This is deliberately a dependency graph, not a second state machine. The
 * authoritative services named by the domain registry remain responsible for
 * checking these conditions at command time. S2/S3 may strengthen how those
 * checks are executed, but UI code must never become the authority for them.
 */
export const V3_WORKFLOW_DEPENDENCY_REGISTRY = [
  {
    operation: "entry.publish",
    ownerDomain: "publication",
    requires: [
      {
        id: "entry-verified",
        domain: "entry",
        description: "The exact entry revision intended for publication is verified.",
        severity: "blocking",
        condition: "entry.current_revision.status == verified",
      },
      {
        id: "required-media-accepted",
        domain: "media",
        description: "Every media asset required by publication policy is accepted.",
        severity: "blocking",
        condition: "media.required_assets.all(status == accepted)",
      },
      {
        id: "publication-state-public",
        domain: "publication",
        description: "The publication layer explicitly permits public visibility.",
        severity: "blocking",
        condition: "publication.visibility == public",
      },
    ],
    blocks: ["public-entry-visible"],
    produces: ["publication.changed"],
    evidence: ["V3 System plan §216 entry publication"],
    implementationState: "declared",
  },
  {
    operation: "jury.close",
    ownerDomain: "jury",
    requires: [
      {
        id: "jury-round-open",
        domain: "jury",
        description: "The canonical Jury round is currently open.",
        severity: "blocking",
        condition: "jury.round.status == open",
      },
      {
        id: "jury-close-actor-permitted",
        domain: "permissions",
        description: "The authenticated actor has permission for the exact Jury scope.",
        severity: "blocking",
        condition: "capability(jury.manage, edition, show) == allowed",
      },
      {
        id: "jury-no-active-close-operation",
        domain: "receipt",
        description: "No equivalent close operation is already processing for this round.",
        severity: "blocking",
        condition: "operation(jury.close, round).active == false",
      },
      {
        id: "jury-missing-ballots-reviewed",
        domain: "jury",
        description: "Missing ballots are surfaced according to contest rules before close.",
        severity: "advisory",
        condition: "jury.missing_ballots handled according to effective rules",
      },
    ],
    blocks: ["results.finalize"],
    produces: ["jury.closed"],
    evidence: ["V3 System plan §217 jury close"],
    implementationState: "declared",
  },
  {
    operation: "results.finalize",
    ownerDomain: "results",
    requires: [
      {
        id: "jury-finalized",
        domain: "jury",
        description: "Jury input required by the result configuration is finalized.",
        severity: "blocking",
        condition: "jury.result_input == finalized_or_not_required",
      },
      {
        id: "televote-finalized",
        domain: "televote",
        description: "Televote input required by the result configuration is finalized.",
        severity: "blocking",
        condition: "televote.result_input == finalized_or_not_required",
      },
      {
        id: "voting-config-frozen",
        domain: "voting-configuration",
        description: "The effective voting/result configuration is frozen for calculation.",
        severity: "blocking",
        condition: "voting_configuration.state == frozen",
      },
      {
        id: "no-integrity-blockers",
        domain: "integrity",
        description: "No blocking integrity decision prevents result finalization.",
        severity: "blocking",
        condition: "integrity.blocking_issue_count == 0",
      },
    ],
    blocks: ["publication.publish_result"],
    produces: ["results.locked"],
    evidence: ["V3 System plan §213 cross-domain prerequisites"],
    implementationState: "declared",
  },
  {
    operation: "publication.publish_result",
    ownerDomain: "publication",
    requires: [
      {
        id: "authoritative-result-version-ready",
        domain: "results",
        description: "Publication references the exact authoritative result version that is release-ready.",
        severity: "blocking",
        condition: "results.authoritative_version == reviewed == locked == reveal_ready",
      },
      {
        id: "publication-actor-permitted",
        domain: "permissions",
        description: "The authenticated actor may publish results for the exact edition/show scope.",
        severity: "blocking",
        condition: "capability(result.publish, edition, show) == allowed",
      },
    ],
    blocks: ["public-result-visible"],
    produces: ["publication.changed"],
    evidence: [
      "supabase/migrations/20260919162106_publication_requires_reveal_ready_results.sql",
      "V3 System plan public-result consistency requirements",
    ],
    implementationState: "enforced",
  },
] as const satisfies readonly V3WorkflowDependency[];

export function v3WorkflowDependency(operation: string) {
  return V3_WORKFLOW_DEPENDENCY_REGISTRY.find((item) => item.operation === operation) ?? null;
}

export function validateV3WorkflowDependencyRegistry() {
  const errors: string[] = [];
  const operations = new Set<string>();
  for (const dependency of V3_WORKFLOW_DEPENDENCY_REGISTRY) {
    if (operations.has(dependency.operation)) errors.push(`duplicate operation ${dependency.operation}`);
    operations.add(dependency.operation);
    if (!v3SystemDomain(dependency.ownerDomain)) {
      errors.push(`${dependency.operation} has unknown owner domain ${dependency.ownerDomain}`);
    }
    for (const condition of dependency.requires) {
      if (!v3SystemDomain(condition.domain)) {
        errors.push(`${dependency.operation}/${condition.id} has unknown dependency domain ${condition.domain}`);
      }
    }
  }
  return errors;
}
