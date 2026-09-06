import {
  calculateAdvancedFriendVotingRisk,
  FRIEND_VOTING_MODEL_VERSION,
  type AdvancedFriendVotingObservation,
} from "@/integrations/televoting/advanced-friend-voting";
import {
  canonicalEditionForRound,
  loadCanonicalVotingContextServer,
} from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import type { FriendVotingSettings } from "@/integrations/televoting/friend-voting-settings.server";
import { recentEditionWeight } from "@/integrations/televoting/history-weighting";
import {
  getMergedIntelligenceServer,
  type IntelligenceOptions,
} from "@/integrations/televoting/intelligence.server";

type Submission = {
  id: string;
  round_id: string;
  country_code: string;
  status: string | null;
};
type Entry = { submission_id: string; target_country_code: string; points: number };
type RoundEntry = { round_id: string; entry_key: string; country_code: string | null };
type Round = { id: string; edition_id: string };
type Observation = {
  identityKey: string;
  controllerPersonId: string | null;
  editionId: string;
  editionNumber: number | null;
  channel: "televote" | "jury";
  voterCountryCode: string;
  targetCode: string;
  score: number;
  maxScore: number;
  supported: boolean;
  maximum: boolean;
  rank: number | null;
  participantCount: number;
};

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();

function ranks(rows: Array<{ target: string; score: number }>) {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
  const map = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index]!;
    if (previous == null || row.score !== previous) rank = index + 1;
    map.set(row.target, rank);
    previous = row.score;
  }
  return map;
}

function advanced(row: Observation): AdvancedFriendVotingObservation {
  return {
    editionId: row.editionId,
    editionNumber: row.editionNumber,
    channel: row.channel,
    voterId: row.identityKey,
    targetCode: row.targetCode,
    score: row.score,
    maxScore: row.maxScore,
    supported: row.supported,
    maximum: row.maximum,
    rank: row.rank,
    participantCount: row.participantCount,
  };
}

function reciprocalEvidence(pair: Observation[], all: Observation[]) {
  const currentNumbers = all.map((row) => row.editionNumber).filter((value): value is number => value != null && Number.isFinite(value));
  const currentEdition = currentNumbers.length ? Math.max(...currentNumbers) : null;
  const byEdition = new Map<string, { weight: number; reciprocal: boolean }>();
  for (const row of pair) {
    const reverse = all.filter((candidate) =>
      candidate.editionId === row.editionId &&
      candidate.channel === row.channel &&
      candidate.voterCountryCode === row.targetCode &&
      candidate.targetCode === row.voterCountryCode,
    );
    if (!reverse.length) continue;
    const age = currentEdition != null && row.editionNumber != null ? Math.max(0, currentEdition - row.editionNumber) : 0;
    const item = byEdition.get(row.editionId) ?? { weight: recentEditionWeight(age), reciprocal: false };
    if (row.supported && reverse.some((candidate) => candidate.supported)) item.reciprocal = true;
    byEdition.set(row.editionId, item);
  }
  const values = [...byEdition.values()];
  const denominator = values.reduce((sum, row) => sum + row.weight, 0);
  return {
    rate: denominator ? values.filter((row) => row.reciprocal).reduce((sum, row) => sum + row.weight, 0) / denominator : 0,
    editions: values.length,
  };
}

export async function getMergedIntelligenceV4Server(
  options: IntelligenceOptions,
  settings: FriendVotingSettings,
) {
  const base = await getMergedIntelligenceServer({ ...options, advancedModel: settings.advancedModel });
  const lens = options.lens === "country" ? "country" : "hod";
  const channel = options.channel === "jury" || options.channel === "televote" ? options.channel : "combined";
  const canonical = await loadCanonicalVotingContextServer();
  const editionNumber = (id: string) => {
    const row = canonical.hod.editionsById.get(id) as any;
    return row?.edition_number == null ? null : Number(row.edition_number);
  };
  const countriesWithHodHistory = new Set(canonical.hod.assignments.map((assignment: any) => String(assignment.country_id)));

  const [roundResult, roundEntryResult, submissionResult, entryResult] = await Promise.all([
    televotingAdmin.from("rounds").select("id,edition_id"),
    televotingAdmin.from("round_entries").select("round_id,entry_key,country_code"),
    televotingAdmin.from("vote_submissions").select("id,round_id,country_code,status").limit(50000),
    televotingAdmin.from("vote_entries").select("submission_id,target_country_code,points").limit(250000),
  ]);
  for (const result of [roundResult, roundEntryResult, submissionResult, entryResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const canonicalEditionByRound = new Map<string, string>();
  for (const row of (roundResult.data ?? []) as Round[]) {
    const id = canonicalEditionForRound(canonical, row);
    if (id) canonicalEditionByRound.set(row.id, id);
  }
  const participantCodesByRound = new Map<string, Set<string>>();
  const entryCode = new Map<string, string>();
  for (const row of (roundEntryResult.data ?? []) as RoundEntry[]) {
    const code = upper(row.country_code || row.entry_key);
    if (!code) continue;
    entryCode.set(`${row.round_id}:${row.entry_key}`, code);
    const set = participantCodesByRound.get(row.round_id) ?? new Set<string>();
    set.add(code);
    participantCodesByRound.set(row.round_id, set);
  }
  const entriesBySubmission = new Map<string, Entry[]>();
  for (const row of (entryResult.data ?? []) as Entry[]) {
    const list = entriesBySubmission.get(row.submission_id) ?? [];
    list.push(row);
    entriesBySubmission.set(row.submission_id, list);
  }

  const observations: Observation[] = [];
  if (channel !== "jury") {
    for (const submission of (submissionResult.data ?? []) as Submission[]) {
      if (submission.status === "deleted") continue;
      const editionId = canonicalEditionByRound.get(submission.round_id);
      if (!editionId) continue;
      const voterCode = upper(submission.country_code);
      const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
      const countryId = voterCountry?.id ? String(voterCountry.id) : null;
      const hod = canonical.hod.resolve(editionId, countryId, "televote");
      const countryFallback = lens === "hod" && Boolean(countryId) && !countriesWithHodHistory.has(String(countryId));
      if (lens === "hod" && !hod && !countryFallback) continue;
      const identityKey = lens === "country"
        ? `country:${voterCode}`
        : hod ? `hod:${hod.personId}` : `country-fallback:${voterCode}`;
      if (options.hodPersonId && hod?.personId !== options.hodPersonId) continue;
      if (options.editionId && editionId !== options.editionId) continue;

      const points = new Map<string, number>();
      for (const entry of entriesBySubmission.get(submission.id) ?? []) {
        const code = entryCode.get(`${submission.round_id}:${entry.target_country_code}`) ?? upper(entry.target_country_code);
        if (code) points.set(code, Number(entry.points ?? 0));
      }
      const targets = [...(participantCodesByRound.get(submission.round_id) ?? new Set<string>())].filter((code) => code !== voterCode);
      const rows = targets.map((target) => ({ target, score: points.get(target) ?? 0 }));
      const rankMap = ranks(rows);
      const maxScore = Math.max(0, ...rows.map((row) => row.score));
      for (const row of rows) observations.push({
        identityKey,
        controllerPersonId: hod?.personId ?? null,
        editionId,
        editionNumber: editionNumber(editionId),
        channel: "televote",
        voterCountryCode: voterCode,
        targetCode: row.target,
        score: row.score,
        maxScore,
        supported: row.score > 0,
        maximum: row.score > 0 && row.score === maxScore,
        rank: rankMap.get(row.target) ?? null,
        participantCount: rows.length,
      });
    }
  }

  if (channel !== "televote") {
    const byBallot = new Map<string, typeof canonical.juryVotes>();
    for (const vote of canonical.juryVotes) {
      if (!vote.voter_country_id) continue;
      const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
      const list = byBallot.get(key) ?? [];
      list.push(vote);
      byBallot.set(key, list);
    }
    for (const ballot of byBallot.values()) {
      const first = ballot[0];
      if (!first?.voter_country_id) continue;
      const editionId = String(first.edition_id);
      if (options.editionId && editionId !== options.editionId) continue;
      const voterCountry = canonical.hod.countriesById.get(first.voter_country_id) as any;
      if (!voterCountry) continue;
      const voterCode = upper(voterCountry.short_code ?? voterCountry.name);
      const countryId = String(first.voter_country_id);
      const hod = canonical.hod.resolve(editionId, countryId, "jury");
      const countryFallback = lens === "hod" && !countriesWithHodHistory.has(countryId);
      if (lens === "hod" && !hod && !countryFallback) continue;
      if (options.hodPersonId && hod?.personId !== options.hodPersonId) continue;
      const identityKey = lens === "country"
        ? `country:${voterCode}`
        : hod ? `hod:${hod.personId}` : `country-fallback:${voterCode}`;
      const scores = new Map(ballot.filter((vote) => vote.receiving_country_id).map((vote) => [String(vote.receiving_country_id), Number(vote.points ?? 0)]));
      const participants = first.show_id
        ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
        : canonical.editionParticipants.get(editionId) ?? new Set<string>();
      const rows: Array<{ target: string; score: number }> = [];
      for (const targetId of participants) {
        if (targetId === first.voter_country_id) continue;
        const target = canonical.hod.countriesById.get(targetId) as any;
        if (!target) continue;
        rows.push({ target: upper(target.short_code ?? target.name), score: scores.get(targetId) ?? 0 });
      }
      const rankMap = ranks(rows);
      const maxScore = Math.max(0, ...rows.map((row) => row.score));
      for (const row of rows) observations.push({
        identityKey,
        controllerPersonId: hod?.personId ?? null,
        editionId,
        editionNumber: editionNumber(editionId),
        channel: "jury",
        voterCountryCode: voterCode,
        targetCode: row.target,
        score: row.score,
        maxScore,
        supported: row.score > 0,
        maximum: row.score > 0 && row.score === maxScore,
        rank: rankMap.get(row.target) ?? null,
        participantCount: rows.length,
      });
    }
  }

  const advancedAll = observations.map(advanced);
  const pairMap = new Map<string, Observation[]>();
  for (const row of observations) {
    const key = `${row.identityKey}\u0000${row.targetCode}`;
    const list = pairMap.get(key) ?? [];
    list.push(row);
    pairMap.set(key, list);
  }
  const updated = new Map<string, ReturnType<typeof calculateAdvancedFriendVotingRisk>>();
  for (const [key, pair] of pairMap) {
    const reciprocal = reciprocalEvidence(pair, observations);
    updated.set(key, calculateAdvancedFriendVotingRisk(
      pair.map(advanced),
      advancedAll,
      reciprocal.rate,
      reciprocal.editions,
      null,
      settings.advancedModel,
    ));
  }

  const relationships = base.relationships.map((row) => {
    const v4 = updated.get(`${row.identityKey}\u0000${row.targetCode}`);
    if (!v4) return row;
    return {
      ...row,
      riskScore: v4.overallRisk,
      confidence: v4.confidence,
      reasons: v4.reasons,
      warnings: v4.warnings,
      juryRisk: v4.juryRisk,
      televoteRisk: v4.televoteRisk,
      crossChannelRisk: v4.crossChannelRisk,
      relationshipAnomaly: v4.relationshipAnomaly,
      reciprocityRisk: v4.reciprocityRisk,
      intensityRisk: v4.intensityRisk,
      historicalDeviationRisk: v4.historicalDeviationRisk,
      rankPatternRisk: v4.rankPatternRisk,
      networkRisk: v4.networkRisk,
      countryStrengthRisk: v4.countryStrengthRisk,
      recentRisk: v4.recentRisk,
      lifetimeRisk: v4.lifetimeRisk,
      similarityRisk: v4.similarityRisk,
      continuityRisk: v4.continuityRisk,
      effectiveRecentEditions: v4.sampleSize.effectiveRecentEditions,
      effectiveLifetimeEditions: v4.sampleSize.effectiveLifetimeEditions,
      currentStreak: v4.evidence.currentStreak,
      modelVersion: FRIEND_VOTING_MODEL_VERSION,
      evidence: { ...row.evidence, ...v4.evidence },
    };
  }).sort((a, b) => b.riskScore - a.riskScore || b.confidence - a.confidence);

  return {
    ...base,
    relationships,
    historyWeighting: {
      modelVersion: FRIEND_VOTING_MODEL_VERSION,
      editionDecay: 0.88,
      fourEditionsAgoWeight: recentEditionWeight(4),
      lifetimeFloor: 0.15,
      recentShare: 0.75,
      lifetimeShare: 0.25,
    },
  };
}
