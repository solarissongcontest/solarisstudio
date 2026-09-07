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

type Submission = {
  id: string;
  country_code: string;
  username: string;
  username_normalized: string;
  status: string | null;
  risk_score: number;
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

export async function recomputeResultIntegrityServer(roundId: string) {
  await requireMergedTelevotingAdminServer();
  const round = await loadMergedConversionRound(roundId);
  if (round.televote_engine_version !== ROBUST_TELEVOTE_ENGINE_VERSION) {
    throw new Error("Cluster influence analysis requires Robust Televote v2");
  }
  if (round.calculation_version <= 0) throw new Error("Calculate the televote result first");

  const participants = await loadMergedConversionParticipants(roundId);
  const ballots = await loadMergedRobustBallots(roundId, participants);
  const identity = await currentSubmissionIdentity(roundId);
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

  const { error: deleteError } = await televotingAdmin
    .from("round_influence_results")
    .delete()
    .eq("round_id", roundId)
    .eq("calculation_version", round.calculation_version)
    .eq("subject_type", "cluster");
  if (deleteError) throw new Error(deleteError.message);

  const clusterMeta = new Map(clusters.map((group) => [group.id, group]));
  const rows = influence.clusters.map((row) => ({
    round_id: roundId,
    calculation_version: round.calculation_version,
    subject_type: "cluster",
    subject_key: row.clusterId,
    members: row.members,
    winner_changed: row.winnerChanged,
    top_three_changed: row.topThreeChanged,
    qualifier_changed: row.qualifierChanged,
    max_rank_movement: row.maxRankMovement,
    max_point_movement: row.maxPointMovement,
    most_affected_entry: row.mostAffectedEntry,
  }));
  if (rows.length) {
    const { error: insertError } = await televotingAdmin.from("round_influence_results").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  return {
    clustersAnalysed: rows.length,
    detectedGroups: coordination.groups.length,
    currentGroups: clusters.map((group) => ({
      id: group.id,
      memberNames: group.memberNames,
      riskScore: group.riskScore,
      ballots: group.members.length,
      influence: influence.clusters.find((row) => row.clusterId === group.id) ?? null,
      metadata: clusterMeta.get(group.id) ?? null,
    })),
  };
}

export async function getResultIntegrityServer(roundId: string) {
  await requireMergedTelevotingAdminServer();
  const round = await loadMergedConversionRound(roundId);
  const identity = await currentSubmissionIdentity(roundId);

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
