import { randomUUID } from "node:crypto";

import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import {
  canonicalEditionForRound,
  loadCanonicalVotingContextServer,
} from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { getCoordinationGroupsServer } from "@/integrations/televoting/coordination-groups.server";
import {
  loadMergedConversionParticipants,
  loadMergedConversionRound,
  loadMergedRobustBallots,
} from "@/integrations/televoting/conversion.server";
import { loadFriendVotingSettingsServer } from "@/integrations/televoting/friend-voting-settings.server";
import { analyseRobustInfluence } from "@/integrations/televoting/influence-math";
import {
  DEFAULT_ROBUST_TELEVOTE_CONFIG,
  ROBUST_TELEVOTE_ENGINE_VERSION,
  type RobustTelevoteConfig,
} from "@/integrations/televoting/robust-televote-math";
import { reconcileSystemOperationServer } from "@/lib/system-operation-reconciliation.server";

type Submission = {
  id: string;
  country_code: string;
  username: string;
  username_normalized: string;
  status: string | null;
  risk_score: number;
};

export type ResultIntegrityRecomputeOperationInput = {
  editionId: string;
  roundId: string;
  expectedCalculationVersion: number;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

type ResultIntegrityOperationResult = {
  ok: true;
  operationId: string;
  correlationId: string;
  solarisEditionId: string;
  roundId: string;
  calculationVersion: number;
  evidenceRevision: number;
  evidenceFingerprint: string;
  rowCount: number;
};

function configForRound(round: Awaited<ReturnType<typeof loadMergedConversionRound>>): RobustTelevoteConfig {
  return {
    ballotTotal: DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotTotal,
    ballotExponent: Number(round.ballot_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotExponent),
    breadthFloor: Number(round.breadth_floor ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthFloor),
    breadthExponent: Number(round.breadth_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthExponent),
    supportExponent: Number(round.support_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.supportExponent),
    rankBoostStrength: Number(round.rank_boost_strength ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostStrength),
    rankBoostShape: Number(round.rank_boost_shape ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostShape),
  };
}

function influenceSeverity(row: {
  winner_changed: boolean;
  qualifier_changed: boolean;
  top_three_changed: boolean;
  max_rank_movement: number;
  max_point_movement: number;
}) {
  if (row.winner_changed) return 100;
  if (row.qualifier_changed) return 90;
  if (row.top_three_changed) return 75;
  return Math.min(70, Math.round(row.max_rank_movement * 10 + Math.min(30, row.max_point_movement)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOperationResult(value: unknown): ResultIntegrityOperationResult | null {
  if (!isRecord(value)) return null;
  const result = value;
  if (
    result.ok !== true
    || typeof result.operationId !== "string"
    || typeof result.correlationId !== "string"
    || typeof result.solarisEditionId !== "string"
    || typeof result.roundId !== "string"
    || typeof result.calculationVersion !== "number"
    || typeof result.evidenceRevision !== "number"
    || typeof result.evidenceFingerprint !== "string"
    || typeof result.rowCount !== "number"
  ) {
    return null;
  }
  return result as ResultIntegrityOperationResult;
}

async function currentSubmissionIdentity(roundId: string) {
  const canonical = await loadCanonicalVotingContextServer();
  const { data: remoteRound, error: roundError } = await televotingAdmin
    .from("rounds")
    .select("id,edition_id")
    .eq("id", roundId)
    .single();
  if (roundError) throw new Error(roundError.message);
  const editionId = canonicalEditionForRound(canonical, {
    id: String(remoteRound.id),
    edition_id: String(remoteRound.edition_id),
  });

  const { data, error } = await televotingAdmin
    .from("vote_submissions")
    .select("id,country_code,username,username_normalized,status,risk_score")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);
  const submissions = ((data ?? []) as Submission[]).filter((row) => row.status !== "deleted");

  const hodBySubmission = new Map<string, string>();
  const labelBySubmission = new Map<string, string>();
  const submissionIdsByHod = new Map<string, string[]>();
  for (const row of submissions) {
    labelBySubmission.set(row.id, `${row.username} · ${row.country_code}`);
    if (!editionId) continue;
    const country = canonical.hod.countriesByCode.get(String(row.country_code).trim().toUpperCase()) as any;
    const hod = canonical.hod.resolve(editionId, country?.id ? String(country.id) : null, "televote");
    if (!hod) continue;
    hodBySubmission.set(row.id, hod.personId);
    const list = submissionIdsByHod.get(hod.personId) ?? [];
    list.push(row.id);
    submissionIdsByHod.set(hod.personId, list);
  }

  return { editionId, submissions, hodBySubmission, labelBySubmission, submissionIdsByHod };
}

async function loadRecomputeAuthority(
  roundId: string,
  expectedEditionId?: string,
  expectedCalculationVersion?: number,
) {
  const round = await loadMergedConversionRound(roundId);
  if (round.televote_engine_version !== ROBUST_TELEVOTE_ENGINE_VERSION) {
    throw new Error("Cluster influence analysis requires Robust Televote v2");
  }
  if (round.calculation_version <= 0) throw new Error("Calculate the televote result first");
  if (
    expectedCalculationVersion !== undefined
    && round.calculation_version !== expectedCalculationVersion
  ) {
    throw new Error("Result Integrity calculation version changed; refresh before recomputing");
  }

  const identity = await currentSubmissionIdentity(roundId);
  if (!identity.editionId) {
    throw new Error("Voting round is not bound to a Solaris edition");
  }
  if (expectedEditionId && identity.editionId !== expectedEditionId) {
    throw new Error("Voting round is outside the requested Solaris edition");
  }

  return { round, identity };
}

async function applyIntegrityEvidence(
  command: ResultIntegrityRecomputeOperationInput,
  evidence: Array<{
    subjectKey: string;
    members: string[];
    winnerChanged: boolean;
    topThreeChanged: boolean;
    qualifierChanged: boolean;
    maxRankMovement: number;
    maxPointMovement: number;
    mostAffectedEntry: string | null;
  }>,
) {
  const { data, error } = await televotingAdmin.rpc(
    "studio2_apply_result_integrity_recompute",
    {
      p_solaris_edition_id: command.editionId,
      p_round_id: command.roundId,
      p_expected_calculation_version: command.expectedCalculationVersion,
      p_evidence: evidence,
      p_operation_id: command.operationId,
      p_idempotency_key: command.idempotencyKey,
      p_correlation_id: command.correlationId,
    },
  );

  if (!error) {
    const result = parseOperationResult(data);
    if (!result) throw new Error("Result Integrity operation returned an invalid receipt result");
    return { result, reconciled: false };
  }

  // One bounded read-after-write reconciliation handles the only ambiguous case:
  // the database may have committed successfully while the transport response was
  // lost. Validation/state failures normally have no receipt and fall through to
  // the original RPC error.
  const reconciliation = await reconcileSystemOperationServer(command.operationId);
  if (reconciliation.ok && reconciliation.receipt.status === "succeeded") {
    const result = parseOperationResult(reconciliation.receipt.result);
    if (result) return { result, reconciled: true };
  }
  if (reconciliation.ok && reconciliation.receipt.status !== "succeeded") {
    throw new Error(
      reconciliation.receipt.error?.message
        ?? `Result Integrity operation is ${reconciliation.receipt.status}`,
    );
  }
  throw new Error(error.message);
}

async function recomputeWithOperation(command: ResultIntegrityRecomputeOperationInput) {
  const { round, identity } = await loadRecomputeAuthority(
    command.roundId,
    command.editionId,
    command.expectedCalculationVersion,
  );

  const participants = await loadMergedConversionParticipants(command.roundId);
  const ballots = await loadMergedRobustBallots(command.roundId, participants);
  const settings = await loadFriendVotingSettingsServer();
  const coordination = await getCoordinationGroupsServer(
    { lens: "hod", channel: "combined", editionId: identity.editionId },
    settings,
  );

  const clusters = coordination.groups
    .map((group) => ({
      id: group.id,
      members: [...new Set(group.memberIds.flatMap((personId) => identity.submissionIdsByHod.get(personId) ?? []))],
      memberNames: group.memberNames,
      riskScore: group.riskScore,
    }))
    .filter((group) => group.members.length >= 2);

  const influence = analyseRobustInfluence({
    participants,
    ballots,
    totalPoints: round.total_points_to_distribute,
    config: configForRound(round),
    clusters: clusters.map((group) => ({ id: group.id, members: group.members })),
  });

  const evidence = influence.clusters.map((row) => ({
    subjectKey: row.clusterId,
    members: row.members,
    winnerChanged: row.winnerChanged,
    topThreeChanged: row.topThreeChanged,
    qualifierChanged: row.qualifierChanged,
    maxRankMovement: row.maxRankMovement,
    maxPointMovement: row.maxPointMovement,
    mostAffectedEntry: row.mostAffectedEntry ?? null,
  }));

  const operation = await applyIntegrityEvidence(command, evidence);
  const clusterMeta = new Map(clusters.map((group) => [group.id, group]));

  return {
    clustersAnalysed: evidence.length,
    detectedGroups: coordination.groups.length,
    currentGroups: clusters.map((group) => ({
      id: group.id,
      memberNames: group.memberNames,
      riskScore: group.riskScore,
      ballots: group.members.length,
      influence: influence.clusters.find((row) => row.clusterId === group.id) ?? null,
      metadata: clusterMeta.get(group.id) ?? null,
    })),
    operation: operation.result,
    reconciled: operation.reconciled,
  };
}

/**
 * Canonical V3 mutation boundary. The caller owns stable operation identity and
 * binds the request to the exact Solaris edition + calculation version it saw.
 */
export async function recomputeResultIntegrityOperationServer(
  command: ResultIntegrityRecomputeOperationInput,
) {
  await requireMergedTelevotingAdminServer();
  return recomputeWithOperation(command);
}

/**
 * Compatibility adapter for the pre-V3 specialist route. It no longer owns a
 * direct delete/insert path: the server derives exact scope/version and creates
 * a one-shot operation envelope before calling the same canonical RPC.
 */
export async function recomputeResultIntegrityServer(roundId: string) {
  await requireMergedTelevotingAdminServer();
  const { round, identity } = await loadRecomputeAuthority(roundId);
  const operationId = randomUUID();
  return recomputeWithOperation({
    editionId: identity.editionId,
    roundId,
    expectedCalculationVersion: round.calculation_version,
    operationId,
    idempotencyKey: operationId,
    correlationId: operationId,
  });
}

export async function getResultIntegrityServer(roundId: string, expectedEditionId?: string) {
  await requireMergedTelevotingAdminServer();
  const round = await loadMergedConversionRound(roundId);
  const identity = await currentSubmissionIdentity(roundId);
  if (expectedEditionId && identity.editionId !== expectedEditionId) {
    throw new Error("Voting round is outside the requested Solaris edition");
  }

  const [influenceResult, resultRows, preflightResult] = await Promise.all([
    televotingAdmin
      .from("round_influence_results")
      .select("*")
      .eq("round_id", roundId)
      .eq("calculation_version", round.calculation_version),
    televotingAdmin
      .from("round_results")
      .select("country_code,original_votes,effective_points,supporter_count,effective_supporters,breadth_ratio,breadth_factor,robust_support,robust_rank,final_points")
      .eq("round_id", roundId)
      .order("final_points", { ascending: false }),
    televotingAdmin
      .from("vote_preflight_checks")
      .select("id,username_normalized,country_code,risk_score,confidence,severity,intervention_level,model_version,voter_reason_categories,admin_evidence,created_at,submission_id")
      .eq("round_id", roundId)
      .order("risk_score", { ascending: false })
      .limit(100),
  ]);
  for (const result of [influenceResult, resultRows, preflightResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const influences = (influenceResult.data ?? []).map((row: any) => ({
    ...row,
    severityScore: influenceSeverity(row),
    label: row.subject_type === "voter"
      ? identity.labelBySubmission.get(String(row.subject_key)) ?? String(row.subject_key)
      : `Detected group · ${Array.isArray(row.members) ? row.members.length : 0} ballots`,
    memberLabels: Array.isArray(row.members)
      ? row.members.map((id: string) => identity.labelBySubmission.get(id) ?? id)
      : [],
  })).sort((a: any, b: any) => b.severityScore - a.severityScore || b.max_point_movement - a.max_point_movement);

  const concentration = (resultRows.data ?? []).map((row: any) => ({
    countryCode: String(row.country_code),
    rawPoints: Number(row.original_votes ?? 0),
    effectivePoints: Number(row.effective_points ?? 0),
    supporterCount: Number(row.supporter_count ?? 0),
    effectiveSupporters: Number(row.effective_supporters ?? 0),
    breadthRatio: Number(row.breadth_ratio ?? 0),
    breadthFactor: Number(row.breadth_factor ?? 1),
    robustSupport: Number(row.robust_support ?? 0),
    robustRank: Number(row.robust_rank ?? 0),
    finalPoints: Number(row.final_points ?? 0),
  })).sort((a, b) => a.breadthRatio - b.breadthRatio || b.finalPoints - a.finalPoints);

  const preflights = (preflightResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    username: String(row.username_normalized),
    countryCode: String(row.country_code),
    riskScore: Number(row.risk_score ?? 0),
    confidence: Number(row.confidence ?? 0),
    severity: String(row.severity ?? "none"),
    interventionLevel: String(row.intervention_level ?? "none"),
    modelVersion: String(row.model_version ?? "unknown"),
    reasonCategories: Array.isArray(row.voter_reason_categories) ? row.voter_reason_categories : [],
    adminEvidence: row.admin_evidence ?? {},
    createdAt: String(row.created_at),
    submissionId: row.submission_id ? String(row.submission_id) : null,
  }));

  return {
    round: {
      id: round.id,
      name: round.name,
      solarisEditionId: identity.editionId,
      engineVersion: round.televote_engine_version,
      calculationVersion: round.calculation_version,
      resultsStatus: round.results_status,
      totalPoints: round.total_points_to_distribute,
    },
    summary: {
      votersAnalysed: influences.filter((row: any) => row.subject_type === "voter").length,
      clustersAnalysed: influences.filter((row: any) => row.subject_type === "cluster").length,
      winnerSensitive: influences.filter((row: any) => row.winner_changed).length,
      topThreeSensitive: influences.filter((row: any) => row.top_three_changed).length,
      highRiskPreflights: preflights.filter((row) => row.riskScore >= 75).length,
      declarations: preflights.filter((row) => ["declaration", "enhanced_declaration", "provisional_review"].includes(row.interventionLevel)).length,
    },
    influences,
    concentration,
    preflights,
  };
}
