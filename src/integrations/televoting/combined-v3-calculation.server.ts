import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import {
  COMBINED_ENGINE_VERSION,
  computeCombined,
  type ComponentSourceInput,
  type CorrectionScope,
  type SourceInputMode,
} from "@/integrations/televoting/combined-math";

type CalculationVersions = {
  configVersion: number;
  stateVersion: number;
  calculationVersion: number;
};

export type GovernedCombinedCalculationInput = {
  editionId: string;
  aggregationId: string;
  versions: CalculationVersions;
  operationId: string;
  idempotencyKey: string;
  correlationId?: string | null;
  reason?: string | null;
};

type SnapshotSource = {
  id: string;
  name: string;
  type: string;
  inputMode: SourceInputMode;
  percentageWeight: number;
  enabled: boolean;
  displayOrder: number;
  correctionTargetSourceId: string | null;
  correctionScope: CorrectionScope;
  values: Record<string, number>;
  distributions?: Record<string, number[]>;
};

type CalculationSnapshot = {
  aggregation: {
    totalPoints: number;
    rankExponent: number;
  };
  participants: string[];
  sources: SnapshotSource[];
};

function requireServiceCommitConfiguration() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    throw new Error(
      "Combined Results calculation commit is unavailable because the server service role is not configured.",
    );
  }
}

function finiteNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid Combined calculation snapshot ${label}.`);
  return number;
}

function stringArray(value: unknown, label: string, max: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) {
    throw new Error(`Invalid Combined calculation snapshot ${label}.`);
  }
  const strings = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`Invalid Combined calculation snapshot ${label}.`);
    }
    return item.trim().toUpperCase();
  });
  if (new Set(strings).size !== strings.length) {
    throw new Error(`Duplicate Combined calculation snapshot ${label}.`);
  }
  return strings;
}

function numberRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Combined calculation snapshot ${label}.`);
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const code = key.trim().toUpperCase();
      if (!code) throw new Error(`Invalid Combined calculation snapshot ${label}.`);
      return [code, finiteNumber(item, label)];
    }),
  );
}

function distributionRecord(value: unknown, label: string) {
  if (value == null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Combined calculation snapshot ${label}.`);
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (!Array.isArray(item) || item.length > 10000) {
        throw new Error(`Invalid Combined calculation snapshot ${label}.`);
      }
      return [key.trim().toUpperCase(), item.map((score) => finiteNumber(score, label))];
    }),
  );
}

function parseSnapshot(value: unknown): CalculationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Combined calculation snapshot.");
  }
  const raw = value as Record<string, unknown>;
  const aggregation = raw["aggregation"];
  if (!aggregation || typeof aggregation !== "object" || Array.isArray(aggregation)) {
    throw new Error("Invalid Combined calculation aggregation snapshot.");
  }
  const aggregationRecord = aggregation as Record<string, unknown>;
  const participants = stringArray(raw["participants"], "participants", 500);

  if (!Array.isArray(raw["sources"]) || raw["sources"].length < 1 || raw["sources"].length > 100) {
    throw new Error("Invalid Combined calculation sources snapshot.");
  }

  const sources = raw["sources"].map((item, index): SnapshotSource => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Invalid Combined calculation source ${index + 1}.`);
    }
    const source = item as Record<string, unknown>;
    const id = String(source["id"] ?? "").trim();
    const name = String(source["name"] ?? "").trim();
    const type = String(source["type"] ?? "").trim();
    const inputMode = String(source["inputMode"] ?? "") as SourceInputMode;
    if (!id || !name || !type || !["raw_results", "converted_points", "activity_points", "correction"].includes(inputMode)) {
      throw new Error(`Invalid Combined calculation source ${index + 1}.`);
    }
    const correctionScope = String(source["correctionScope"] ?? "final") as CorrectionScope;
    if (!["source", "final"].includes(correctionScope)) {
      throw new Error(`Invalid Combined calculation correction scope ${index + 1}.`);
    }
    return {
      id,
      name,
      type,
      inputMode,
      percentageWeight: finiteNumber(source["percentageWeight"], `source ${index + 1} weight`),
      enabled: Boolean(source["enabled"]),
      displayOrder: Math.trunc(finiteNumber(source["displayOrder"], `source ${index + 1} order`)),
      correctionTargetSourceId:
        source["correctionTargetSourceId"] == null
          ? null
          : String(source["correctionTargetSourceId"]),
      correctionScope,
      values: numberRecord(source["values"] ?? {}, `source ${index + 1} values`),
      distributions: distributionRecord(
        source["distributions"],
        `source ${index + 1} distributions`,
      ),
    };
  });

  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new Error("Duplicate Combined calculation source identity.");
  }

  return {
    aggregation: {
      totalPoints: finiteNumber(aggregationRecord["totalPoints"], "total points"),
      rankExponent: finiteNumber(aggregationRecord["rankExponent"], "rank exponent"),
    },
    participants,
    sources,
  };
}

async function failCalculation(operationId: string, code: string, metadata: Record<string, unknown>) {
  requireServiceCommitConfiguration();
  await (supabaseAdmin as any).rpc("v3_fail_combined_result_calculation_service", {
    p_operation_id: operationId,
    p_error_code: code,
    p_metadata: metadata,
  });
}

export async function recalculateCombinedResultV3Server(
  input: GovernedCombinedCalculationInput,
) {
  await requireMergedTelevotingAdminServer();
  requireServiceCommitConfiguration();

  if (!input.editionId || !input.aggregationId || !input.operationId || !input.idempotencyKey.trim()) {
    throw new Error("Combined Results calculation identity is incomplete.");
  }
  for (const [key, value] of Object.entries(input.versions)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Combined Results ${key} is invalid.`);
    }
  }

  const authenticated = createSolarisAuthenticatedClientServer() as any;
  const { data: begin, error: beginError } = await authenticated.rpc(
    "v3_begin_combined_result_calculation",
    {
      p_edition_id: input.editionId,
      p_aggregation_id: input.aggregationId,
      p_expected_config_version: input.versions.configVersion,
      p_expected_state_version: input.versions.stateVersion,
      p_expected_calculation_version: input.versions.calculationVersion,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey.trim(),
      p_correlation_id: input.correlationId ?? null,
      p_reason: input.reason?.trim() || null,
    },
  );
  if (beginError) throw new Error(beginError.message);
  if (begin?.status === "succeeded" && begin?.result) return begin.result;
  if (begin?.status === "failed") {
    throw new Error(String(begin?.error?.code ?? "Combined Results calculation failed."));
  }

  const operationId = String(begin?.operationId ?? input.operationId);
  const { data: serviceSnapshot, error: snapshotError } = await (supabaseAdmin as any).rpc(
    "v3_combined_result_calculation_snapshot_service",
    { p_operation_id: operationId },
  );
  if (snapshotError) {
    await failCalculation(operationId, "DEPENDENCY_FAILURE", {
      stage: "snapshot_rpc",
      databaseCode: snapshotError.code ?? null,
    });
    throw new Error(snapshotError.message);
  }
  if (!serviceSnapshot?.ok) {
    throw new Error(String(serviceSnapshot?.error?.code ?? "Combined Results input snapshot failed."));
  }

  let snapshot: CalculationSnapshot;
  try {
    snapshot = parseSnapshot(serviceSnapshot.snapshot);
  } catch (error) {
    await failCalculation(operationId, "VALIDATION", { stage: "snapshot_parse" });
    throw error;
  }

  const calculationSources: ComponentSourceInput[] = snapshot.sources.map((source) => ({
    id: source.id,
    name: source.name,
    type: source.type,
    inputMode: source.inputMode,
    percentageWeight: source.percentageWeight,
    enabled: source.enabled,
    displayOrder: source.displayOrder,
    values: source.values,
    distributions: source.distributions,
    correctionTargetSourceId: source.correctionTargetSourceId,
    correctionScope: source.correctionScope,
  }));

  const calculated = computeCombined({
    participants: snapshot.participants,
    sources: calculationSources,
    totalPoints: snapshot.aggregation.totalPoints,
    rankExponent: snapshot.aggregation.rankExponent,
  });

  if (calculated.errors.length) {
    await failCalculation(operationId, "VALIDATION", {
      stage: "engine",
      errorCount: calculated.errors.length,
    });
    throw new Error(calculated.errors[0] ?? "Combined Results calculation failed.");
  }

  const poolMap = new Map(calculated.pools.map((pool) => [pool.sourceId, pool]));
  const pools = calculated.pools.map((pool) => ({
    // Keep canonical camelCase identity for payload validation and SQL-shaped
    // aliases for the bounded relational update in the commit function.
    sourceId: pool.sourceId,
    source_id: pool.sourceId,
    method: pool.method,
    exactPool: pool.exactPool,
    exact_pool: pool.exactPool,
    flooredPool: pool.flooredPool,
    floored_pool: pool.flooredPool,
    poolRemainder: pool.poolRemainder,
    pool_remainder: pool.poolRemainder,
    poolBonus: pool.poolBonus,
    pool_bonus: pool.poolBonus,
    finalPool: pool.finalPool,
    final_pool: pool.finalPool,
  }));

  const componentRows = calculated.rows.flatMap((row) =>
    row.componentResults.map((component) => ({
      sourceId: component.sourceId,
      sourceName: component.sourceName,
      sourceType: component.sourceType,
      countryCode: component.countryCode,
      method: component.method,
      percentageWeight: poolMap.get(component.sourceId)?.percentageWeight ?? 0,
      componentPool: poolMap.get(component.sourceId)?.finalPool ?? 0,
      rawScore: component.rawScore,
      rawRank: component.rawRank,
      participantCount: component.participantCount,
      rankBase: component.rankBase,
      rankExponent: component.rankExponent,
      rankFactor: component.rankFactor,
      weightedScore: component.weightedScore,
      sourceWeightedTotal: component.sourceWeightedTotal,
      exactAllocation: component.exactAllocation,
      flooredAllocation: component.flooredAllocation,
      decimalRemainder: component.decimalRemainder,
      remainderBonus: component.remainderBonus,
      finalAllocatedPoints: component.finalAllocatedPoints,
      tieBreakData: component.tieBreakData,
    })),
  );

  const finalRows = calculated.rows.map((row) => ({
    countryCode: row.code,
    sourceContributions: row.componentResults.map((component) => ({
      source_id: component.sourceId,
      source_name: component.sourceName,
      source_type: component.sourceType,
      method: component.method,
      raw_score: component.rawScore,
      allocated_points: component.finalAllocatedPoints,
    })),
    totalVotingPoints: row.totalVotingPoints,
    totalActivityPoints: row.totalActivityPoints,
    finalCorrection: row.finalCorrection,
    finalCombinedPoints: row.finalCombinedPoints,
    finalRank: row.finalRank,
    finalTieBreakData: row.finalTieBreakData,
    convertedPoints: row.totalVotingPoints,
    postConversionBonus: row.totalActivityPoints,
    postConversionAdjustment: row.finalCorrection,
    finalTelevoteScore: row.finalCombinedPoints,
    combinedOriginalRank: row.finalRank,
    participantCount: snapshot.participants.length,
  }));

  const { data: committed, error: commitError } = await (supabaseAdmin as any).rpc(
    "v3_commit_combined_result_calculation_service",
    {
      p_operation_id: operationId,
      p_input_fingerprint: String(serviceSnapshot.inputFingerprint),
      p_engine_version: COMBINED_ENGINE_VERSION,
      p_pools: pools,
      p_component_rows: componentRows,
      p_final_rows: finalRows,
    },
  );
  if (commitError) {
    await failCalculation(operationId, "DATABASE", {
      stage: "commit_rpc",
      databaseCode: commitError.code ?? null,
    });
    throw new Error(commitError.message);
  }
  if (!committed?.ok) {
    throw new Error(String(committed?.error?.code ?? "Combined Results calculation did not commit."));
  }

  return {
    ...committed,
    warnings: calculated.warnings,
  };
}
