export const V3_RELEASE_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const V3_RELEASE_POLICY_VERSION = "v3-release-doctrine-1" as const;

export type V3ReleaseGateResult = "pass" | "fail";

export type V3ReleaseEvidence = {
  schema_version: 1;
  candidate_sha: string;
  gate_id: string;
  result: V3ReleaseGateResult;
  workflow_run_id: string;
  job_name: string;
  produced_at: string;
  policy_version?: string;
  evidence_digest?: string;
  check_version?: string;
  artifact_reference?: string;
};

export type V3ReleaseManifest = {
  schema_version: 1;
  candidate_sha: string;
  policy_version: typeof V3_RELEASE_POLICY_VERSION;
  release_ready: boolean;
  release_risk: {
    hard_blockers: number;
    conditional_blockers: number;
    tracked_migration_debt: number;
    obsolete_or_replaced: number;
    unresolved_total: number;
  };
  gates: readonly {
    id: string;
    blocking: true;
    result: V3ReleaseGateResult | "missing" | "invalid";
    workflow_run_id?: string;
    produced_at?: string;
    artifact_reference?: string;
  }[];
  evidence: Readonly<Record<string, V3ReleaseEvidence>>;
  errors: readonly string[];
};

export const V3_REQUIRED_RELEASE_GATES = [
  "s15-ownership",
  "s16-mutation-authority",
  "security-privacy",
  "full-contest",
  "results-integration",
  "migration-upgrade",
  "production-isolation",
  "browser-certification",
] as const;

function validSha(value: string) {
  return /^[0-9a-f]{40}$/.test(value);
}

export function validateV3ReleaseEvidence(
  evidence: unknown,
  candidateSha: string,
  gateId?: string,
): string[] {
  const errors: string[] = [];
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return ["evidence is not an object"];
  const value = evidence as Partial<V3ReleaseEvidence>;
  if (value.schema_version !== V3_RELEASE_EVIDENCE_SCHEMA_VERSION) errors.push("unsupported schema_version");
  if (typeof value.candidate_sha !== "string" || !validSha(value.candidate_sha)) errors.push("candidate_sha is not a full lowercase SHA");
  else if (value.candidate_sha !== candidateSha) errors.push(`candidate_sha ${value.candidate_sha} does not match ${candidateSha}`);
  if (typeof value.gate_id !== "string" || !value.gate_id.trim()) errors.push("gate_id missing");
  else if (gateId && value.gate_id !== gateId) errors.push(`gate_id ${value.gate_id} does not match ${gateId}`);
  if (value.result !== "pass" && value.result !== "fail") errors.push("result must be pass or fail");
  if (typeof value.workflow_run_id !== "string" || !value.workflow_run_id.trim()) errors.push("workflow_run_id missing");
  if (typeof value.job_name !== "string" || !value.job_name.trim()) errors.push("job_name missing");
  if (typeof value.produced_at !== "string" || Number.isNaN(Date.parse(value.produced_at))) errors.push("produced_at is invalid");
  if (value.policy_version && value.policy_version !== V3_RELEASE_POLICY_VERSION) errors.push(`incompatible policy_version ${value.policy_version}`);
  return errors;
}

export type V3ReleaseRiskCounts = {
  hard_blocker: number; conditional_blocker: number; tracked_migration_debt: number;
  obsolete_or_replaced: number; unresolvedTotal: number;
};

function releaseRiskIssues(risk: V3ReleaseRiskCounts) {
  const keys = ["hard_blocker", "conditional_blocker", "tracked_migration_debt", "obsolete_or_replaced", "unresolvedTotal"] as const;
  if (keys.some((key) => !Number.isSafeInteger(risk?.[key]) || risk[key] < 0)) return ["release risk requires complete nonnegative integer counts"];
  if (keys.slice(0, 4).reduce((sum, key) => sum + risk[key], 0) !== risk.unresolvedTotal) return ["release risk inventory total is inconsistent"];
  return [];
}

export function parseV3ReleaseRiskEvidence(value: unknown, candidateSha: string): V3ReleaseRiskCounts {
  if (!value || typeof value !== "object") throw new Error("Release risk evidence is missing");
  const source = value as { candidateSha?: unknown; releaseRisk?: { totals?: Record<string, unknown>; unresolvedTotal?: unknown }; releaseRiskTotals?: Record<string, unknown>; currentReadinessFindingCount?: unknown };
  if (source.candidateSha !== candidateSha) throw new Error("Release risk evidence does not match the checked-out candidate SHA");
  const totals = source.releaseRisk?.totals ?? source.releaseRiskTotals;
  const risk = {
    hard_blocker: totals?.hard_blocker,
    conditional_blocker: totals?.conditional_blocker,
    tracked_migration_debt: totals?.tracked_migration_debt,
    obsolete_or_replaced: totals?.obsolete_or_replaced,
    unresolvedTotal: source.releaseRisk?.unresolvedTotal ?? source.currentReadinessFindingCount,
  } as V3ReleaseRiskCounts;
  const errors = releaseRiskIssues(risk);
  if (errors.length) throw new Error(errors.join("; "));
  return risk;
}

export function buildV3ReleaseManifest(input: {
  candidateSha: string;
  releaseRisk: {
    hard_blocker: number;
    conditional_blocker: number;
    tracked_migration_debt: number;
    obsolete_or_replaced: number;
    unresolvedTotal: number;
  };
  evidence: readonly unknown[];
  requiredGates?: readonly string[];
}): V3ReleaseManifest {
  const required = input.requiredGates ?? V3_REQUIRED_RELEASE_GATES;
  const errors: string[] = releaseRiskIssues(input.releaseRisk);
  const byGate = new Map<string, V3ReleaseEvidence>();

  if (!validSha(input.candidateSha)) errors.push("candidate SHA is not a full lowercase SHA");
  for (const item of input.evidence) {
    const candidate = item as Partial<V3ReleaseEvidence> | null;
    const gate = typeof candidate?.gate_id === "string" ? candidate.gate_id : "<unknown>";
    const issues = validateV3ReleaseEvidence(item, input.candidateSha);
    if (issues.length) {
      errors.push(`${gate}: ${issues.join("; ")}`);
      continue;
    }
    const evidence = item as V3ReleaseEvidence;
    if (byGate.has(evidence.gate_id)) {
      errors.push(`${evidence.gate_id}: ambiguous duplicate evidence`);
      continue;
    }
    byGate.set(evidence.gate_id, evidence);
  }

  const gates = required.map((id) => {
    const evidence = byGate.get(id);
    if (!evidence) {
      errors.push(`${id}: required exact-SHA evidence missing`);
      return { id, blocking: true as const, result: "missing" as const };
    }
    return {
      id,
      blocking: true as const,
      result: evidence.result,
      workflow_run_id: evidence.workflow_run_id,
      produced_at: evidence.produced_at,
      artifact_reference: evidence.artifact_reference,
    };
  });

  const releaseReady =
    errors.length === 0 &&
    input.releaseRisk.hard_blocker === 0 &&
    input.releaseRisk.conditional_blocker === 0 &&
    gates.every((gate) => gate.result === "pass");

  return {
    schema_version: 1,
    candidate_sha: input.candidateSha,
    policy_version: V3_RELEASE_POLICY_VERSION,
    release_ready: releaseReady,
    release_risk: {
      hard_blockers: input.releaseRisk.hard_blocker,
      conditional_blockers: input.releaseRisk.conditional_blocker,
      tracked_migration_debt: input.releaseRisk.tracked_migration_debt,
      obsolete_or_replaced: input.releaseRisk.obsolete_or_replaced,
      unresolved_total: input.releaseRisk.unresolvedTotal,
    },
    gates,
    evidence: Object.fromEntries(byGate),
    errors,
  };
}
