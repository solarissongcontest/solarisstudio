import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadCanonicalVotingContextServer,
} from "@/integrations/televoting/canonical-context.server";
import type {
  VoteIntegrityReport,
  VoteIntegritySeverity,
} from "@/integrations/televoting/integrity";
import {
  aggregateJuryIndependenceRisk,
  calculateJuryCoordinationFingerprint,
  calculateJuryDeviationRisk,
  JURY_INDEPENDENCE_MODEL_VERSION,
  type JuryPeerBallot,
} from "@/integrations/jury-voting/jury-independence-v5";
import {
  runJuryIntegrityPreflightV4Server,
} from "@/integrations/jury-voting/jury-integrity-v4.server";
import type { JuryPreflightInput } from "@/integrations/jury-voting/jury-voting.server";

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();

function severityForRisk(risk: number): VoteIntegritySeverity {
  if (risk >= 90) return "critical";
  if (risk >= 80) return "high";
  if (risk >= 65) return "strong";
  if (risk >= 50) return "review";
  if (risk >= 30) return "notable";
  return "none";
}

function requiresAttestation(level: string) {
  return level === "declaration" || level === "enhanced_declaration" || level === "provisional_review";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function runJuryIntegrityPreflightV5Server(
  input: JuryPreflightInput,
): Promise<VoteIntegrityReport> {
  // V4 remains the authorization, eligibility, historical relationship,
  // reciprocity, recency, HOD-identity and cross-channel foundation. V5 adds
  // jury-specific peer deviation, multi-peer coordination fingerprints and
  // stricter evidence gates before a high risk tier is allowed.
  const base = await runJuryIntegrityPreflightV4Server(input);

  const auth = await supabaseAdmin.auth.getUser(input.accessToken);
  const user = auth.data.user;
  if (auth.error || !user) throw new Error("Your Solaris sign-in has expired. Sign in again.");

  const db = supabaseAdmin as any;
  const [accountResult, showResult] = await Promise.all([
    db.from("country_accounts").select("country_id").eq("user_id", user.id).single(),
    db.from("shows").select("id,edition_id,name").eq("id", input.showId).single(),
  ]);
  if (accountResult.error) throw new Error(accountResult.error.message);
  if (showResult.error) throw new Error(showResult.error.message);

  const account = accountResult.data as { country_id: string };
  const show = showResult.data as { id: string; edition_id: string; name: string };
  const countryId = String(account.country_id);
  const canonical = await loadCanonicalVotingContextServer();
  const country = canonical.hod.countriesById.get(countryId) as any;
  if (!country) throw new Error("Country identity is unavailable");
  const countryCode = upper(country.short_code ?? country.name);

  const participantIds = canonical.participantsByShow.get(String(show.id)) ?? new Set<string>();
  const participantCodes: string[] = [];
  const targetCodeById = new Map<string, string>();
  for (const targetId of participantIds) {
    const target = canonical.hod.countriesById.get(targetId) as any;
    if (!target) continue;
    const targetCode = upper(target.short_code ?? target.name);
    if (!targetCode) continue;
    participantCodes.push(targetCode);
    targetCodeById.set(String(targetId), targetCode);
  }

  const maxScore = Math.max(1, ...input.entries.map((entry) => Number(entry.points) || 0));
  const currentAllocations: Record<string, number> = {};
  for (const entry of input.entries) {
    const targetCode = targetCodeById.get(entry.target_country_id);
    if (targetCode) currentAllocations[targetCode] = Number(entry.points) || 0;
  }

  const juryByVoter = new Map<string, typeof canonical.juryVotes>();
  for (const vote of canonical.juryVotes) {
    if (String(vote.show_id ?? "") !== String(show.id) || !vote.voter_country_id) continue;
    if (String(vote.voter_country_id) === countryId) continue;
    const key = String(vote.voter_country_id);
    const list = juryByVoter.get(key) ?? [];
    list.push(vote);
    juryByVoter.set(key, list);
  }

  const peers: JuryPeerBallot[] = [];
  for (const [voterCountryId, votes] of juryByVoter) {
    const voterCountry = canonical.hod.countriesById.get(voterCountryId) as any;
    if (!voterCountry) continue;
    const allocations: Record<string, number> = {};
    for (const vote of votes) {
      if (!vote.receiving_country_id) continue;
      const targetCode = targetCodeById.get(String(vote.receiving_country_id));
      if (targetCode) allocations[targetCode] = Number(vote.points ?? 0);
    }
    peers.push({
      voterId: upper(voterCountry.short_code ?? voterCountry.name),
      maxScore,
      allocations,
    });
  }

  const deviation = calculateJuryDeviationRisk({
    current: Object.entries(currentAllocations).map(([targetCode, score]) => ({
      targetCode,
      score,
      maxScore,
    })),
    peers,
  });
  const fingerprint = calculateJuryCoordinationFingerprint({
    current: { voterId: countryCode, maxScore, allocations: currentAllocations },
    peers,
    participants: participantCodes,
  });

  const reciprocity = Math.max(0, ...base.findings.map((row) => Number(row.reciprocalSupport ?? 0)));
  const similarity = Math.max(
    0,
    ...base.findings.map((row) => Number(row.similarityRisk ?? 0)),
    base.riskScore > base.relationshipRisk ? base.riskScore : 0,
  );
  const persistence = Math.max(0, ...base.findings.map((row) => Number(row.continuityRisk ?? 0)));
  const crossChannelEditions = Math.max(0, ...base.findings.map((row) => Number(row.crossChannelEditions ?? 0)));
  const crossChannel = Math.min(100, crossChannelEditions * 25);
  const effectiveRecent = Math.max(
    Number(base.history.effectiveRecentEditions ?? 0),
    ...base.findings.map((row) => Number(row.effectiveRecentEditions ?? 0)),
  );
  const uniqueHistoricalEditions = Math.max(0, ...base.findings.map((row) => Number(row.uniqueEditions ?? 0)));
  const repeatedHistory = effectiveRecent >= 2.4 || uniqueHistoricalEditions >= 3;

  const aggregate = aggregateJuryIndependenceRisk({
    components: {
      history: base.relationshipRisk,
      deviation: deviation.risk,
      reciprocity,
      coordination: similarity,
      network: fingerprint.risk,
      crossChannel,
      persistence,
    },
    baseConfidence: Number(base.confidence ?? 0),
    peerBallots: peers.length,
    deviationTargets: deviation.targets.length,
    repeatedHistory,
  });

  const reasonCategories = [
    base.relationshipRisk >= 30 ? "historical_relationship" : null,
    deviation.risk >= 35 ? "jury_score_deviation" : null,
    reciprocity >= 45 ? "reciprocal_pattern" : null,
    similarity >= 45 ? "ballot_similarity" : null,
    fingerprint.risk >= 45 ? "coordinated_group_pattern" : null,
    crossChannel >= 50 ? "cross_channel_pattern" : null,
    persistence >= 45 ? "persistent_recent_pattern" : null,
    aggregate.evidenceFamilyCount >= 3 ? "multiple_independent_signals" : null,
  ].filter((value): value is string => Boolean(value));

  const severity = severityForRisk(aggregate.risk);
  const attestationRequired = requiresAttestation(aggregate.interventionLevel);
  const tv = db.schema("televoting");
  const evidenceResult = await tv
    .from("vote_preflight_checks")
    .select("admin_evidence")
    .eq("id", base.token)
    .single();
  if (evidenceResult.error) throw new Error(evidenceResult.error.message);
  const previousEvidence = asObject(evidenceResult.data?.admin_evidence);
  const adminEvidence = {
    ...previousEvidence,
    juryIndependence: {
      modelVersion: JURY_INDEPENDENCE_MODEL_VERSION,
      independenceScore: aggregate.independenceScore,
      risk: aggregate.risk,
      confidence: aggregate.confidence,
      components: {
        history: base.relationshipRisk,
        deviation: deviation.risk,
        reciprocity,
        coordination: similarity,
        network: fingerprint.risk,
        crossChannel,
        persistence,
      },
      evidenceFamilyCount: aggregate.evidenceFamilyCount,
      strongEvidenceFamilies: aggregate.strongEvidenceFamilies,
      repeatedHistory,
      peerBallots: peers.length,
      deviation: {
        risk: deviation.risk,
        strongestTarget: deviation.strongestTarget,
        targets: deviation.targets,
      },
      coordinationFingerprint: fingerprint,
      recommendedSanctionLevel: aggregate.recommendedSanctionLevel,
      automaticSanction: false,
      automaticVoteReduction: false,
      note: "Jury v5 evidence is for confirmation and organizer review. It never changes or deletes a score automatically.",
    },
  };

  const { error: updateError } = await tv
    .from("vote_preflight_checks")
    .update({
      risk_score: aggregate.risk,
      confidence: aggregate.confidence,
      severity,
      intervention_level: aggregate.interventionLevel,
      requires_attestation: attestationRequired,
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
    riskScore: aggregate.risk,
    confidence: aggregate.confidence,
    independenceScore: aggregate.independenceScore,
    severity,
    interventionLevel: aggregate.interventionLevel,
    requiresAttestation: attestationRequired,
    reasonCategories,
  };
}
