import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { interventionRequiresAttestation } from "@/integrations/televoting/integrity-policy";
import type { VoteIntegrityReport } from "@/integrations/televoting/integrity";
import {
  applyJuryEvidenceGates,
  calculateJuryPeerDeviation,
  JURY_INDEPENDENCE_MODEL_VERSION,
  jurySeverity,
  resolveJuryIntervention,
  type JuryIndependenceBallot,
} from "@/integrations/jury-voting/jury-independence";
import {
  runJuryIntegrityPreflightV4Server,
} from "@/integrations/jury-voting/jury-integrity-v4.server";
import type { JuryPreflightInput } from "@/integrations/jury-voting/jury-voting.server";

type JuryVoteRow = {
  voter_country_id: string | null;
  receiving_country_id: string | null;
  points: number | null;
};

type StoredPreflight = {
  admin_evidence: Record<string, unknown> | null;
};

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mergeReasonCategories(base: string[] | undefined, additions: string[]) {
  return [...new Set([...(base ?? []), ...additions])];
}

function peerBallots(rows: JuryVoteRow[], ownCountryId: string) {
  const grouped = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const voterId = String(row.voter_country_id ?? "");
    const targetId = String(row.receiving_country_id ?? "");
    if (!voterId || voterId === ownCountryId || !targetId) continue;
    const allocations = grouped.get(voterId) ?? {};
    allocations[targetId] = numberValue(row.points);
    grouped.set(voterId, allocations);
  }
  return [...grouped.entries()].map(([voterId, allocations]): JuryIndependenceBallot => ({ voterId, allocations }));
}

/**
 * Jury Integrity v5 keeps the v4 historical/HOD/cross-channel engine and adds
 * a jury-specific current-peer deviation layer plus stricter evidence gates.
 * Detailed detector evidence is stored for producers but not returned to the
 * voter-facing client.
 */
export async function runJuryIntegrityPreflightV5Server(input: JuryPreflightInput): Promise<VoteIntegrityReport> {
  const base = await runJuryIntegrityPreflightV4Server(input);

  const auth = await supabaseAdmin.auth.getUser(input.accessToken);
  const user = auth.data.user;
  if (auth.error || !user) throw new Error("Your Solaris sign-in has expired. Sign in again.");

  const db = supabaseAdmin as any;
  const tv = db.schema("televoting");
  const [accountResult, juryVotesResult, preflightResult] = await Promise.all([
    db.from("country_accounts").select("country_id").eq("user_id", user.id).single(),
    db
      .from("jury_votes")
      .select("voter_country_id,receiving_country_id,points")
      .eq("show_id", input.showId),
    tv
      .from("vote_preflight_checks")
      .select("admin_evidence")
      .eq("id", base.token)
      .single(),
  ]);

  if (accountResult.error) throw new Error(accountResult.error.message);
  if (juryVotesResult.error) throw new Error(juryVotesResult.error.message);
  if (preflightResult.error) throw new Error(preflightResult.error.message);

  const ownCountryId = String((accountResult.data as { country_id: string }).country_id);
  const peers = peerBallots((juryVotesResult.data ?? []) as JuryVoteRow[], ownCountryId);
  const currentAllocations = Object.fromEntries(
    input.entries.map((entry) => [String(entry.target_country_id), numberValue(entry.points)]),
  );
  const deviation = calculateJuryPeerDeviation({
    current: { voterId: ownCountryId, allocations: currentAllocations },
    others: peers,
    targetIds: input.entries.map((entry) => String(entry.target_country_id)),
  });

  const existing = (preflightResult.data ?? {}) as StoredPreflight;
  const existingAdminEvidence = existing.admin_evidence && typeof existing.admin_evidence === "object"
    ? existing.admin_evidence
    : {};
  const existingSimilarity = existingAdminEvidence.similarity && typeof existingAdminEvidence.similarity === "object"
    ? existingAdminEvidence.similarity as Record<string, unknown>
    : {};
  const similarityRisk = numberValue(existingSimilarity.risk);
  const historicalEditions = Math.max(0, ...base.findings.map((finding) => finding.uniqueEditions));
  const crossChannelEditions = Math.max(0, ...base.findings.map((finding) => finding.crossChannelEditions));

  const gated = applyJuryEvidenceGates({
    baseRisk: base.riskScore,
    baseConfidence: base.confidence ?? 0,
    relationshipRisk: base.relationshipRisk,
    deviation,
    reasonCategories: base.reasonCategories ?? [],
    historicalEditions,
    crossChannelEditions,
    similarityRisk,
  });

  const interventionLevel = resolveJuryIntervention({
    risk: gated.risk,
    confidence: gated.confidence,
    strongCurrentCoordinationEvidence: gated.strongCurrentCoordinationEvidence,
  });
  const requiresAttestation = interventionRequiresAttestation(interventionLevel);
  const severity = jurySeverity(gated.risk);
  const reasonCategories = mergeReasonCategories(base.reasonCategories, [
    deviation.risk >= 45 ? "jury_peer_deviation" : "",
    gated.evidenceFamilies.length >= 2 ? "jury_independence_pattern" : "",
  ].filter(Boolean));

  const adminEvidence = {
    ...existingAdminEvidence,
    juryIndependence: {
      modelVersion: JURY_INDEPENDENCE_MODEL_VERSION,
      independenceScore: gated.independenceScore,
      risk: gated.risk,
      confidence: gated.confidence,
      peerDeviationRisk: deviation.risk,
      peerDeviationConfidence: deviation.confidence,
      peerBallots: deviation.peerBallots,
      evidenceFamilies: gated.evidenceFamilies,
      strongCurrentCoordinationEvidence: gated.strongCurrentCoordinationEvidence,
      targets: deviation.targets.map((target) => ({
        targetCountryId: target.targetId,
        score: target.score,
        normalizedScore: Math.round(target.normalizedScore * 1000) / 1000,
        expectedNormalizedScore: Math.round(target.expectedNormalizedScore * 1000) / 1000,
        peerSd: Math.round(target.peerSd * 1000) / 1000,
        positiveDeviation: Math.round(target.positiveDeviation * 1000) / 1000,
        zScore: Math.round(target.zScore * 100) / 100,
        risk: Math.round(target.risk),
      })),
      evidenceGate: {
        minimumFamiliesForReviewEscalation: 2,
        minimumHistoricalEditionsForStrongRisk: 3,
        minimumHistoricalEditionsForHighRisk: 2,
        highRiskRequiresAtLeastFamilies: 3,
      },
    },
  };

  const { error: updateError } = await tv
    .from("vote_preflight_checks")
    .update({
      risk_score: gated.risk,
      confidence: gated.confidence,
      severity,
      intervention_level: interventionLevel,
      requires_attestation: requiresAttestation,
      model_version: JURY_INDEPENDENCE_MODEL_VERSION,
      voter_reason_categories: reasonCategories,
      admin_evidence: adminEvidence,
    })
    .eq("id", base.token)
    .is("submitted_at", null);
  if (updateError) throw new Error(updateError.message);

  return {
    ...base,
    modelVersion: JURY_INDEPENDENCE_MODEL_VERSION,
    riskScore: gated.risk,
    confidence: gated.confidence,
    severity,
    interventionLevel,
    requiresAttestation,
    reasonCategories,
    // Do not expose relationship targets, exact historical patterns, peer
    // deviations or thresholds to voters. Producers retain the detailed v4
    // findings plus v5 jury-independence evidence in the stored preflight row.
    findings: [],
  };
}
