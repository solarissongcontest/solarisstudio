import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  FRIEND_VOTING_MODEL_VERSION,
  calculateAdvancedFriendVotingRisk,
  type AdvancedFriendVotingObservation,
} from "@/integrations/televoting/advanced-friend-voting";
import { calculateBallotSimilarityRisk } from "@/integrations/televoting/ballot-similarity";
import { canonicalEditionForRound, loadCanonicalVotingContextServer } from "@/integrations/televoting/canonical-context.server";
import { loadFriendVotingSettingsServer } from "@/integrations/televoting/friend-voting-settings.server";
import { editionAge, recentEditionWeight } from "@/integrations/televoting/history-weighting";
import {
  VOTE_INTEGRITY_ATTESTATION,
  VOTE_INTEGRITY_AUTOMATION,
  VOTE_INTEGRITY_CONSEQUENCE,
  VOTE_INTEGRITY_COORDINATION,
  VOTE_INTEGRITY_INDEPENDENCE,
  VOTE_INTEGRITY_PRESSURE,
  VOTE_INTEGRITY_STATEMENT_VERSION,
  type VoteIntegrityFinding,
  type VoteIntegrityReport,
  type VoteIntegritySeverity,
  type VoteIntegrityTechnicalSignal,
} from "@/integrations/televoting/integrity";
import {
  interventionRequiresAttestation,
  resolveIntegrityIntervention,
} from "@/integrations/televoting/integrity-policy";
import { getTelevotingNetworkSignals } from "@/integrations/televoting/network.server";
import { enforceTelevotingRateLimit } from "@/integrations/televoting/rate-limit.server";

export type VotePreflightInput = {
  roundId: string;
  username: string;
  countryCode: string;
  entries: Array<{ target_country_code: string; points: number }>;
  fingerprintHash?: string | null;
  deviceTokenHash?: string | null;
};

type RoundRow = { id: string; edition_id: string; name: string; status: string };
type SubmissionRow = {
  id: string;
  round_id: string;
  country_code: string;
  ip_hash: string | null;
  status: string | null;
  deletion_category: string | null;
  created_at: string;
};
type VoteEntryRow = { submission_id: string; target_country_code: string; points: number };
type RoundEntryRow = { round_id: string; entry_key: string; country_code: string | null };
type Observation = {
  editionId: string;
  editionNumber: number | null;
  channel: "televote" | "jury";
  voterCode: string;
  voterCountryId: string | null;
  hodPersonId: string | null;
  targetCode: string;
  score: number;
  maxScore: number;
  supported: boolean;
  maximum: boolean;
  normalized: number;
  rank: number | null;
  participantCount: number;
};

const ignoredDeletedCategories = new Set([
  "test_submission",
  "administrative_error",
  "wrong_voting_country",
]);

function upper(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function shouldUseSubmission(row: SubmissionRow) {
  if (row.status !== "deleted") return true;
  return !ignoredDeletedCategories.has(String(row.deletion_category ?? "").toLowerCase());
}

function pct(value: number) {
  return Math.round(value * 1000) / 10;
}

function severityForRisk(risk: number, settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>): VoteIntegritySeverity {
  if (risk >= settings.riskCritical) return "critical";
  if (risk >= settings.riskHigh) return "high";
  if (risk >= settings.riskStrong) return "strong";
  if (risk >= settings.riskReview) return "review";
  if (risk >= settings.riskNotable) return "notable";
  return "none";
}

function ballotMap(entries: VotePreflightInput["entries"]) {
  return Object.fromEntries(entries.map((entry) => [entry.target_country_code, entry.points]));
}

function ranksForScores(rows: Array<{ target: string; score: number }>) {
  const ordered = [...rows].sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
  const rank = new Map<string, number>();
  ordered.forEach((row, index) => rank.set(row.target, index + 1));
  return rank;
}

function advancedObservation(row: Observation, lens: "hod" | "country"): AdvancedFriendVotingObservation {
  return {
    editionId: row.editionId,
    editionNumber: row.editionNumber,
    channel: row.channel,
    voterId: lens === "hod" && row.hodPersonId ? `hod:${row.hodPersonId}` : `country:${row.voterCode}`,
    targetCode: row.targetCode,
    score: row.score,
    maxScore: row.maxScore,
    supported: row.supported,
    maximum: row.maximum,
    rank: row.rank,
    participantCount: row.participantCount,
  };
}

function reciprocalEvidence(
  pair: Observation[],
  allObservations: Observation[],
  settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>,
) {
  const currentEdition = Math.max(
    ...allObservations.map((row) => Number(row.editionNumber)).filter((value) => Number.isFinite(value)),
    ...pair.map((row) => Number(row.editionNumber)).filter((value) => Number.isFinite(value)),
  );
  const byEdition = new Map<string, { weight: number; supported: boolean }>();
  for (const observation of pair) {
    const reverse = allObservations.filter(
      (candidate) =>
        candidate.editionId === observation.editionId &&
        candidate.channel === observation.channel &&
        candidate.voterCode === observation.targetCode &&
        candidate.targetCode === observation.voterCode,
    );
    if (!reverse.length) continue;
    const age = Number.isFinite(currentEdition) && observation.editionNumber != null
      ? editionAge(currentEdition, observation.editionNumber)
      : 0;
    const weight = recentEditionWeight(age, settings.advancedModel.editionDecay);
    const current = byEdition.get(observation.editionId) ?? { weight, supported: false };
    current.weight = Math.max(current.weight, weight);
    if (observation.supported && reverse.some((candidate) => candidate.supported)) current.supported = true;
    byEdition.set(observation.editionId, current);
  }
  const rows = [...byEdition.values()];
  const opportunities = rows.reduce((sum, row) => sum + row.weight, 0);
  const supported = rows.reduce((sum, row) => sum + (row.supported ? row.weight : 0), 0);
  return {
    rate: opportunities > 0 ? supported / opportunities : 0,
    effectiveEditions: opportunities,
    rawEditions: rows.length,
  };
}

function relationshipFinding(
  observations: Observation[],
  allObservations: Observation[],
  targetCode: string,
  lens: "hod" | "country",
  currentCountryCode: string,
  targetName: string,
  settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>,
): VoteIntegrityFinding | null {
  const pair = observations.filter((observation) => observation.targetCode === targetCode);
  if (!pair.length) return null;

  const reciprocal = reciprocalEvidence(pair, allObservations, settings);
  const advanced = calculateAdvancedFriendVotingRisk(
    pair.map((row) => advancedObservation(row, lens)),
    allObservations.map((row) => advancedObservation(row, lens)),
    reciprocal.rate,
    reciprocal.effectiveEditions,
    null,
    settings.advancedModel,
  );

  const maximumFrequency = pair.length
    ? pair.filter((row) => row.maximum).length / pair.length
    : 0;

  return {
    targetCode,
    targetName,
    lens,
    scopeLabel: lens === "hod"
      ? "Your recent-weighted HOD history across the countries and editions you controlled"
      : `Recent-weighted historical voting from ${currentCountryCode}`,
    riskScore: advanced.overallRisk,
    confidence: advanced.confidence,
    uniqueEditions: advanced.sampleSize.editions,
    supportFrequency: pct(advanced.evidence.recentSupportRate),
    maximumFrequency: pct(maximumFrequency),
    reciprocalSupport: pct(reciprocal.rate),
    crossChannelEditions: advanced.evidence.crossChannelEditions,
    reasons: advanced.reasons,
    recentRisk: advanced.recentRisk,
    lifetimeRisk: advanced.lifetimeRisk,
    effectiveRecentEditions: advanced.sampleSize.effectiveRecentEditions,
    continuityRisk: advanced.continuityRisk,
  };
}

export async function runVoteIntegrityPreflightServer(input: VotePreflightInput): Promise<VoteIntegrityReport> {
  const network = getTelevotingNetworkSignals();
  enforceTelevotingRateLimit(`vote-preflight:${network.ipHash ?? input.deviceTokenHash ?? "anon"}`, {
    limit: 12,
    windowMs: 60_000,
    message: "Too many ballot checks from this connection. Please wait a moment.",
  });

  const username = input.username.trim();
  const countryCode = upper(input.countryCode);
  if (!input.roundId || username.length < 2 || !countryCode) throw new Error("Ballot identity is incomplete");

  const canonical = await loadCanonicalVotingContextServer();
  const settings = await loadFriendVotingSettingsServer();
  const tv = (supabaseAdmin as any).schema("televoting");

  const [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult, tvCountriesResult] = await Promise.all([
    tv.from("rounds").select("id,edition_id,name,status").order("created_at", { ascending: true }),
    tv.from("vote_submissions").select("id,round_id,country_code,ip_hash,status,deletion_category,created_at").order("created_at", { ascending: true }).limit(50000),
    tv.from("vote_entries").select("submission_id,target_country_code,points").limit(250000),
    tv.from("round_entries").select("round_id,entry_key,country_code"),
    tv.from("countries").select("code,name"),
  ]);

  for (const result of [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult, tvCountriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const rounds = (roundsResult.data ?? []) as RoundRow[];
  const currentRound = rounds.find((round) => round.id === input.roundId);
  if (!currentRound) throw new Error("Voting round not found");
  if (currentRound.status !== "open") throw new Error("Voting round is not open");

  const canonicalEditionId = canonicalEditionForRound(canonical, currentRound);
  const editionNumberFor = (editionId: string | null | undefined) => {
    if (!editionId) return null;
    const edition = canonical.hod.editionsById.get(String(editionId)) as any;
    const value = Number(edition?.edition_number);
    return Number.isFinite(value) ? value : null;
  };
  const currentCountry = canonical.hod.countriesByCode.get(countryCode) as any;
  const currentCountryId = currentCountry?.id ? String(currentCountry.id) : null;
  const currentHod = canonical.hod.resolve(canonicalEditionId, currentCountryId, "televote");

  const countryName = new Map<string, string>();
  for (const row of tvCountriesResult.data ?? []) countryName.set(upper((row as any).code), String((row as any).name));
  for (const country of canonical.hod.countries) {
    const code = upper((country as any).short_code);
    if (code) countryName.set(code, String((country as any).name));
  }

  const canonicalEditionByRound = new Map<string, string>();
  for (const round of rounds) {
    const id = canonicalEditionForRound(canonical, round);
    if (id) canonicalEditionByRound.set(round.id, id);
  }

  const roundEntryRows = (roundEntriesResult.data ?? []) as RoundEntryRow[];
  const roundEntryCountry = new Map<string, string>();
  const participantsByRound = new Map<string, Set<string>>();
  for (const row of roundEntryRows) {
    const code = upper(row.country_code);
    if (!code) continue;
    roundEntryCountry.set(`${row.round_id}:${row.entry_key}`, code);
    const participants = participantsByRound.get(row.round_id) ?? new Set<string>();
    participants.add(code);
    participantsByRound.set(row.round_id, participants);
  }

  const voteEntriesBySubmission = new Map<string, VoteEntryRow[]>();
  for (const entry of (voteEntriesResult.data ?? []) as VoteEntryRow[]) {
    const list = voteEntriesBySubmission.get(entry.submission_id) ?? [];
    list.push(entry);
    voteEntriesBySubmission.set(entry.submission_id, list);
  }

  const allObservations: Observation[] = [];
  const usableSubmissions = ((submissionsResult.data ?? []) as SubmissionRow[]).filter(shouldUseSubmission);
  let historicalTelevoteBallots = 0;
  let historicalJuryBallots = 0;

  for (const submission of usableSubmissions) {
    const editionId = canonicalEditionByRound.get(submission.round_id);
    if (!editionId) continue;
    const voterCode = upper(submission.country_code);
    const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
    const voterCountryId = voterCountry?.id ? String(voterCountry.id) : null;
    const hod = canonical.hod.resolve(editionId, voterCountryId, "televote");
    const rawEntries = voteEntriesBySubmission.get(submission.id) ?? [];
    const scoreByTarget = new Map<string, number>();
    for (const entry of rawEntries) {
      const targetCode = roundEntryCountry.get(`${submission.round_id}:${entry.target_country_code}`) ?? upper(entry.target_country_code);
      if (targetCode) scoreByTarget.set(targetCode, Number(entry.points || 0));
    }
    const participants = [...(participantsByRound.get(submission.round_id) ?? new Set<string>())].filter((target) => target !== voterCode);
    const scoreRows = participants.map((target) => ({ target, score: scoreByTarget.get(target) ?? 0 }));
    const rankByTarget = ranksForScores(scoreRows);
    const maxScore = Math.max(0, ...scoreRows.map((row) => row.score));
    if (participants.length) historicalTelevoteBallots += 1;
    for (const row of scoreRows) {
      allObservations.push({
        editionId,
        editionNumber: editionNumberFor(editionId),
        channel: "televote",
        voterCode,
        voterCountryId,
        hodPersonId: hod?.personId ?? null,
        targetCode: row.target,
        score: row.score,
        maxScore,
        supported: row.score > 0,
        maximum: row.score > 0 && maxScore > 0 && row.score === maxScore,
        normalized: maxScore > 0 ? row.score / maxScore : 0,
        rank: rankByTarget.get(row.target) ?? null,
        participantCount: scoreRows.length,
      });
    }
  }

  const juryByBallot = new Map<string, typeof canonical.juryVotes>();
  for (const vote of canonical.juryVotes) {
    if (!vote.voter_country_id) continue;
    const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
    const list = juryByBallot.get(key) ?? [];
    list.push(vote);
    juryByBallot.set(key, list);
  }

  for (const [, ballotVotes] of juryByBallot) {
    const first = ballotVotes[0];
    if (!first?.voter_country_id) continue;
    const voterCountry = canonical.hod.countriesById.get(first.voter_country_id) as any;
    if (!voterCountry) continue;
    const voterCode = upper(voterCountry.short_code ?? voterCountry.name);
    const hod = canonical.hod.resolve(first.edition_id, first.voter_country_id, "jury");
    const scoreByTarget = new Map<string, number>();
    for (const vote of ballotVotes) {
      if (!vote.receiving_country_id) continue;
      const target = canonical.hod.countriesById.get(vote.receiving_country_id) as any;
      if (target) scoreByTarget.set(upper(target.short_code ?? target.name), Number(vote.points ?? 0));
    }
    const participantIds = first.show_id
      ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
      : canonical.editionParticipants.get(String(first.edition_id)) ?? new Set<string>();
    const scoreRows: Array<{ target: string; score: number }> = [];
    for (const targetCountryId of participantIds) {
      if (targetCountryId === first.voter_country_id) continue;
      const target = canonical.hod.countriesById.get(targetCountryId) as any;
      if (!target) continue;
      const targetCode = upper(target.short_code ?? target.name);
      scoreRows.push({ target: targetCode, score: scoreByTarget.get(targetCode) ?? 0 });
    }
    const rankByTarget = ranksForScores(scoreRows);
    const maxScore = Math.max(0, ...scoreRows.map((row) => row.score));
    if (scoreRows.length) historicalJuryBallots += 1;
    for (const row of scoreRows) {
      allObservations.push({
        editionId: String(first.edition_id),
        editionNumber: editionNumberFor(first.edition_id),
        channel: "jury",
        voterCode,
        voterCountryId: String(first.voter_country_id),
        hodPersonId: hod?.personId ?? null,
        targetCode: row.target,
        score: row.score,
        maxScore,
        supported: row.score > 0,
        maximum: row.score > 0 && maxScore > 0 && row.score === maxScore,
        normalized: maxScore > 0 ? row.score / maxScore : 0,
        rank: rankByTarget.get(row.target) ?? null,
        participantCount: scoreRows.length,
      });
    }
  }

  const currentEntries = roundEntryRows.filter((row) => row.round_id === input.roundId);
  const currentEntryCode = new Map(currentEntries.map((row) => [row.entry_key, upper(row.country_code)]));
  const proposedEntryPoints = new Map(input.entries.map((entry) => [entry.target_country_code, Number(entry.points)]));
  const proposedByCode = new Map<string, number>();
  const currentParticipants = [...(participantsByRound.get(input.roundId) ?? new Set<string>())].filter((target) => target !== countryCode);
  for (const row of currentEntries) {
    const targetCode = currentEntryCode.get(row.entry_key);
    if (targetCode) proposedByCode.set(targetCode, proposedEntryPoints.get(row.entry_key) ?? 0);
  }
  const proposedRows = currentParticipants.map((target) => ({ target, score: proposedByCode.get(target) ?? 0 }));
  const proposedRanks = ranksForScores(proposedRows);
  const proposedMax = Math.max(0, ...proposedRows.map((row) => row.score));

  if (canonicalEditionId) {
    for (const row of proposedRows) {
      allObservations.push({
        editionId: canonicalEditionId,
        editionNumber: editionNumberFor(canonicalEditionId),
        channel: "televote",
        voterCode: countryCode,
        voterCountryId: currentCountryId,
        hodPersonId: currentHod?.personId ?? null,
        targetCode: row.target,
        score: row.score,
        maxScore: proposedMax,
        supported: row.score > 0,
        maximum: row.score > 0 && proposedMax > 0 && row.score === proposedMax,
        normalized: proposedMax > 0 ? row.score / proposedMax : 0,
        rank: proposedRanks.get(row.target) ?? null,
        participantCount: proposedRows.length,
      });
    }
  }

  const supportedTargets = proposedRows.filter((row) => row.score > 0).map((row) => row.target);
  const findings: VoteIntegrityFinding[] = [];
  const countryObservations = allObservations.filter((observation) => observation.voterCode === countryCode);
  const hodObservations = currentHod?.personId
    ? allObservations.filter((observation) => observation.hodPersonId === currentHod.personId)
    : [];

  for (const targetCode of supportedTargets) {
    const targetName = countryName.get(targetCode) ?? targetCode;
    const countryFinding = relationshipFinding(countryObservations, allObservations, targetCode, "country", countryCode, targetName, settings);
    if (countryFinding) findings.push(countryFinding);
    if (currentHod?.personId) {
      const hodFinding = relationshipFinding(hodObservations, allObservations, targetCode, "hod", countryCode, targetName, settings);
      if (hodFinding) findings.push(hodFinding);
    }
  }

  findings.sort((a, b) => b.riskScore - a.riskScore || b.confidence - a.confidence);
  const relationshipFindings = findings.filter((finding) => finding.riskScore >= settings.riskNotable);
  const relationshipRisk = Math.max(0, ...findings.map((finding) => finding.riskScore));
  const relationshipConfidence = findings[0]?.confidence ?? 0;

  const activeSameRound = ((submissionsResult.data ?? []) as SubmissionRow[]).filter(
    (submission) => submission.round_id === input.roundId && submission.status !== "deleted",
  );
  const currentEntryKeys = currentEntries.map((row) => row.entry_key);
  const sameRoundBallots = activeSameRound.map((submission) => ({
    voterId: submission.id,
    allocations: Object.fromEntries(
      (voteEntriesBySubmission.get(submission.id) ?? []).map((entry) => [entry.target_country_code, Number(entry.points ?? 0)]),
    ),
  }));
  const similarity = calculateBallotSimilarityRisk({
    current: { voterId: `pending:${username.toLowerCase()}`, allocations: ballotMap(input.entries) },
    others: sameRoundBallots,
    participants: currentEntryKeys,
  });
  const similarityConfidence = sameRoundBallots.length ? Math.min(100, (sameRoundBallots.length / 8) * 100) : 0;

  const historicalIdentitySubmissions = usableSubmissions
    .map((submission) => {
      const editionId = canonicalEditionByRound.get(submission.round_id);
      const voterCode = upper(submission.country_code);
      const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
      const voterCountryId = voterCountry?.id ? String(voterCountry.id) : null;
      const hod = editionId ? canonical.hod.resolve(editionId, voterCountryId, "televote") : null;
      return { submission, hodPersonId: hod?.personId ?? null, voterCode };
    })
    .filter(({ hodPersonId, voterCode }) =>
      voterCode === countryCode || Boolean(currentHod?.personId && hodPersonId === currentHod.personId),
    )
    .sort((a, b) => new Date(b.submission.created_at).getTime() - new Date(a.submission.created_at).getTime());

  const previousIpHashes = [...new Set(
    historicalIdentitySubmissions.map(({ submission }) => submission.ip_hash).filter((value): value is string => Boolean(value)),
  )];
  const latestHistoricalIp = historicalIdentitySubmissions.find(({ submission }) => Boolean(submission.ip_hash))?.submission.ip_hash ?? null;
  const ipChanged = Boolean(network.ipHash && latestHistoricalIp && network.ipHash !== latestHistoricalIp);
  const technicalSignals: VoteIntegrityTechnicalSignal[] = ipChanged
    ? [{
        key: "ip_changed",
        title: "Connection fingerprint changed",
        description: "The hashed IP used for this ballot differs from the most recent recorded ballot linked to this HOD/country history. This is supporting technical context only. Solaris does not expect a fictional country to match the real-world location of an IP address.",
      }]
    : [];

  const notableTargets = new Set(relationshipFindings.map((finding) => finding.targetCode));
  const multiRelationshipBonus = notableTargets.size >= 3 ? 6 : 0;
  const corroborationBonus = relationshipRisk >= 50 && similarity.risk >= 50 ? 5 : 0;
  const riskScore = Math.min(100, Math.max(relationshipRisk, similarity.risk) + multiRelationshipBonus + corroborationBonus);
  const confidence = Math.round(Math.max(
    relationshipConfidence,
    similarity.risk > 0 ? Math.min(similarity.risk, similarityConfidence) : 0,
  ));
  const strongSignalCount = [
    relationshipRisk >= 65,
    similarity.risk >= 65,
    findings.some((finding) => finding.reciprocalSupport >= 60),
    findings.some((finding) => (finding.continuityRisk ?? 0) >= 65),
    notableTargets.size >= 3,
  ].filter(Boolean).length;
  const interventionLevel = resolveIntegrityIntervention({
    risk: riskScore,
    confidence,
    strongSignalCount,
    currentCoordinationEvidence: similarity.currentCoordinationEvidence,
  });
  const requiresAttestation = interventionRequiresAttestation(interventionLevel);
  const severity = severityForRisk(riskScore, settings);

  const reasonCategories = [
    ...(relationshipRisk >= settings.riskNotable ? ["historical_relationship"] : []),
    ...(findings.some((finding) => finding.reciprocalSupport >= 60) ? ["reciprocal_pattern"] : []),
    ...(findings.some((finding) => (finding.continuityRisk ?? 0) >= 65) ? ["recent_persistence"] : []),
    ...(similarity.risk >= settings.riskNotable ? ["unusual_similarity"] : []),
    ...(notableTargets.size >= 3 ? ["multiple_relationships"] : []),
  ];

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
  const history = {
    hodHistoryAvailable: Boolean(currentHod?.personId),
    televoteBallotsConsidered: historicalTelevoteBallots,
    juryBallotsConsidered: historicalJuryBallots,
    previousIpFingerprints: previousIpHashes.length,
    ipChanged,
    effectiveRecentEditions: findings[0]?.effectiveRecentEditions ?? 0,
    effectiveLifetimeEditions: findings[0]?.uniqueEditions ?? 0,
  };

  const adminEvidence = {
    strongSignalCount,
    notableTargetCount: notableTargets.size,
    similarity: {
      risk: similarity.risk,
      strongestSimilarity: similarity.strongestSimilarity,
      baselineMean: similarity.baselineMean,
      baselineSd: similarity.baselineSd,
      zScore: similarity.zScore,
      matchedVoterId: similarity.matchedVoterId,
      currentCoordinationEvidence: similarity.currentCoordinationEvidence,
      comparisonBallots: sameRoundBallots.length,
    },
  };

  const { error: insertError } = await tv.from("vote_preflight_checks").insert({
    id: token,
    round_id: input.roundId,
    username_normalized: username.toLowerCase(),
    country_code: countryCode,
    ballot_map: ballotMap(input.entries),
    ip_hash: network.ipHash,
    fingerprint_hash: input.fingerprintHash ?? null,
    device_token_hash: input.deviceTokenHash ?? null,
    ip_country: network.ipCountry,
    is_vpn: network.isVpn,
    hod_person_id: currentHod?.personId ?? null,
    relationship_risk: relationshipRisk,
    risk_score: riskScore,
    confidence,
    severity,
    intervention_level: interventionLevel,
    requires_attestation: requiresAttestation,
    findings: relationshipFindings.slice(0, 10),
    technical_signals: technicalSignals,
    history_summary: history,
    model_version: FRIEND_VOTING_MODEL_VERSION,
    voter_reason_categories: reasonCategories,
    admin_evidence: adminEvidence,
    statement_version: VOTE_INTEGRITY_STATEMENT_VERSION,
    expires_at: expiresAt,
  });
  if (insertError) throw new Error(insertError.message);

  return {
    token,
    expiresAt,
    automatic: true,
    modelVersion: FRIEND_VOTING_MODEL_VERSION,
    relationshipRisk,
    riskScore,
    confidence,
    severity,
    interventionLevel,
    requiresAttestation,
    reasonCategories,
    findings: relationshipFindings.slice(0, 10),
    technicalSignals,
    history,
  };
}

export async function signVoteIntegrityAttestationServer(input: {
  token: string;
  signedName: string;
  acceptedAutomaticDetection: boolean;
  acceptedIndependence: boolean;
  acceptedConsequences: boolean;
}) {
  const token = String(input.token ?? "");
  const signedName = String(input.signedName ?? "").trim();
  if (!token || !signedName) throw new Error("Signature is required");
  if (!input.acceptedAutomaticDetection || !input.acceptedIndependence || !input.acceptedConsequences) {
    throw new Error("All voting-integrity declarations must be acknowledged");
  }

  const network = getTelevotingNetworkSignals();
  const tv = (supabaseAdmin as any).schema("televoting");
  const { data: row, error } = await tv
    .from("vote_preflight_checks")
    .select("id,username_normalized,requires_attestation,expires_at,submitted_at,ip_hash")
    .eq("id", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Voting integrity check not found");
  if (row.submitted_at) throw new Error("This ballot has already been submitted");
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error("Voting integrity check expired. Review the ballot again.");
  if (!row.requires_attestation) throw new Error("This ballot does not require an integrity declaration");
  if (signedName.toLowerCase() !== String(row.username_normalized).toLowerCase()) {
    throw new Error("Type the same username you registered with to sign the declaration");
  }
  if ((row.ip_hash ?? null) !== (network.ipHash ?? null)) {
    throw new Error("Your connection changed during the integrity review. Return to the ballot and run the automatic check again.");
  }

  const attestationText = [
    VOTE_INTEGRITY_AUTOMATION,
    VOTE_INTEGRITY_INDEPENDENCE,
    VOTE_INTEGRITY_COORDINATION,
    VOTE_INTEGRITY_PRESSURE,
    VOTE_INTEGRITY_CONSEQUENCE,
    VOTE_INTEGRITY_ATTESTATION,
  ].join("\n\n");
  const { error: updateError } = await tv
    .from("vote_preflight_checks")
    .update({
      attested_at: new Date().toISOString(),
      signed_name: signedName,
      attestation_text: attestationText,
      attestation_ip_hash: network.ipHash,
    })
    .eq("id", token)
    .is("submitted_at", null);
  if (updateError) throw new Error(updateError.message);

  return { ok: true };
}
