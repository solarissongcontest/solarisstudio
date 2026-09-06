import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  canonicalEditionForRound,
  loadCanonicalVotingContextServer,
} from "@/integrations/televoting/canonical-context.server";
import {
  calculateAdvancedFriendVotingRisk,
  FRIEND_VOTING_MODEL_VERSION,
  type AdvancedFriendVotingObservation,
} from "@/integrations/televoting/advanced-friend-voting";
import { calculateBallotSimilarityRisk, type SimilarityBallot } from "@/integrations/televoting/ballot-similarity";
import { loadFriendVotingSettingsServer } from "@/integrations/televoting/friend-voting-settings.server";
import { recentEditionWeight } from "@/integrations/televoting/history-weighting";
import {
  interventionRequiresAttestation,
  resolveIntegrityIntervention,
} from "@/integrations/televoting/integrity-policy";
import type {
  VoteIntegrityFinding,
  VoteIntegrityReport,
  VoteIntegritySeverity,
} from "@/integrations/televoting/integrity";
import {
  runJuryIntegrityPreflightServer,
  type JuryPreflightInput,
} from "@/integrations/jury-voting/jury-voting.server";

type RawObservation = {
  editionId: string;
  editionNumber: number | null;
  channel: "televote" | "jury";
  voterCode: string;
  hodPersonId: string | null;
  targetCode: string;
  score: number;
  maxScore: number;
  supported: boolean;
  maximum: boolean;
  rank: number | null;
  participantCount: number;
};

type RoundRow = { id: string; edition_id: string; status: string };
type SubmissionRow = {
  id: string;
  round_id: string;
  country_code: string;
  status: string | null;
  deletion_category: string | null;
};
type VoteEntryRow = { submission_id: string; target_country_code: string; points: number };
type RoundEntryRow = { round_id: string; entry_key: string; country_code: string | null };

const ignoredDeletedCategories = new Set([
  "test_submission",
  "administrative_error",
  "wrong_voting_country",
]);

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();
const pct = (value: number) => Math.round(value * 1000) / 10;

function useSubmission(row: SubmissionRow) {
  if (row.status !== "deleted") return true;
  return !ignoredDeletedCategories.has(String(row.deletion_category ?? "").toLowerCase());
}

function ranks(rows: Array<{ target: string; score: number }>) {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.target.localeCompare(b.target));
  const map = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index]!;
    if (previousScore == null || row.score !== previousScore) previousRank = index + 1;
    map.set(row.target, previousRank);
    previousScore = row.score;
  }
  return map;
}

function severityForRisk(
  risk: number,
  settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>,
): VoteIntegritySeverity {
  if (risk >= settings.riskCritical) return "critical";
  if (risk >= settings.riskHigh) return "high";
  if (risk >= settings.riskStrong) return "strong";
  if (risk >= settings.riskReview) return "review";
  if (risk >= settings.riskNotable) return "notable";
  return "none";
}

function advancedRows(rows: RawObservation[], lens: "country" | "hod") {
  return rows
    .filter((row) => lens === "country" || Boolean(row.hodPersonId))
    .map((row): AdvancedFriendVotingObservation => ({
      editionId: row.editionId,
      editionNumber: row.editionNumber,
      channel: row.channel,
      voterId: lens === "country" ? `country:${row.voterCode}` : `hod:${row.hodPersonId}`,
      targetCode: row.targetCode,
      score: row.score,
      maxScore: row.maxScore,
      supported: row.supported,
      maximum: row.maximum,
      rank: row.rank,
      participantCount: row.participantCount,
    }));
}

function reciprocalEvidence(
  pair: RawObservation[],
  all: RawObservation[],
  currentEditionNumber: number | null,
) {
  const editions = new Map<string, { weight: number; comparable: boolean; reciprocal: boolean }>();
  for (const row of pair) {
    const reverse = all.filter(
      (candidate) =>
        candidate.editionId === row.editionId &&
        candidate.channel === row.channel &&
        candidate.voterCode === row.targetCode &&
        candidate.targetCode === row.voterCode,
    );
    if (!reverse.length) continue;
    const age = currentEditionNumber != null && row.editionNumber != null
      ? Math.max(0, currentEditionNumber - row.editionNumber)
      : 0;
    const item = editions.get(row.editionId) ?? {
      weight: recentEditionWeight(age),
      comparable: false,
      reciprocal: false,
    };
    item.comparable = true;
    if (row.supported && reverse.some((candidate) => candidate.supported)) item.reciprocal = true;
    editions.set(row.editionId, item);
  }
  const comparable = [...editions.values()].filter((row) => row.comparable);
  const denominator = comparable.reduce((sum, row) => sum + row.weight, 0);
  const numerator = comparable.filter((row) => row.reciprocal).reduce((sum, row) => sum + row.weight, 0);
  return {
    rate: denominator ? numerator / denominator : 0,
    editions: comparable.length,
  };
}

function findingFor(options: {
  rows: RawObservation[];
  all: RawObservation[];
  targetCode: string;
  targetName: string;
  countryCode: string;
  hodPersonId: string | null;
  lens: "country" | "hod";
  currentEditionNumber: number | null;
  similarityRisk: number;
  settings: Awaited<ReturnType<typeof loadFriendVotingSettingsServer>>;
}): VoteIntegrityFinding | null {
  const identity = options.lens === "country" ? `country:${options.countryCode}` : `hod:${options.hodPersonId}`;
  if (options.lens === "hod" && !options.hodPersonId) return null;
  const pairRaw = options.rows.filter(
    (row) =>
      row.targetCode === options.targetCode &&
      (options.lens === "country" ? row.voterCode === options.countryCode : row.hodPersonId === options.hodPersonId),
  );
  if (!pairRaw.length) return null;

  const allAdvanced = advancedRows(options.all, options.lens);
  const pairAdvanced = advancedRows(pairRaw, options.lens).filter((row) => row.voterId === identity);
  const reciprocal = reciprocalEvidence(pairRaw, options.all, options.currentEditionNumber);
  const result = calculateAdvancedFriendVotingRisk(
    pairAdvanced,
    allAdvanced,
    reciprocal.rate,
    reciprocal.editions,
    null,
    options.settings.advancedModel,
    { similarityRisk: options.similarityRisk },
  );

  const editions = new Set(pairRaw.map((row) => row.editionId));
  const supportedEditions = new Set(pairRaw.filter((row) => row.supported).map((row) => row.editionId));
  const maximumEditions = new Set(pairRaw.filter((row) => row.maximum).map((row) => row.editionId));
  const channels = new Map<string, Set<string>>();
  for (const row of pairRaw.filter((row) => row.supported)) {
    const set = channels.get(row.editionId) ?? new Set<string>();
    set.add(row.channel);
    channels.set(row.editionId, set);
  }

  return {
    targetCode: options.targetCode,
    targetName: options.targetName,
    lens: options.lens,
    scopeLabel: options.lens === "hod"
      ? "Your HOD history across the countries/editions you controlled"
      : `Historical voting from ${options.countryCode}`,
    riskScore: result.overallRisk,
    confidence: result.confidence,
    uniqueEditions: editions.size,
    supportFrequency: pct(editions.size ? supportedEditions.size / editions.size : 0),
    maximumFrequency: pct(editions.size ? maximumEditions.size / editions.size : 0),
    reciprocalSupport: pct(reciprocal.rate),
    crossChannelEditions: [...channels.values()].filter((set) => set.has("jury") && set.has("televote")).length,
    reasons: result.reasons,
    recentRisk: result.recentRisk,
    lifetimeRisk: result.lifetimeRisk,
    effectiveRecentEditions: result.sampleSize.effectiveRecentEditions,
    similarityRisk: result.similarityRisk,
    continuityRisk: result.continuityRisk,
  };
}

export async function runJuryIntegrityPreflightV4Server(input: JuryPreflightInput): Promise<VoteIntegrityReport> {
  // The legacy function remains the single authorization, eligibility and exact-ballot
  // validation gate. Its short-lived token is then upgraded in-place to v4 evidence.
  const base = await runJuryIntegrityPreflightServer(input);
  const auth = await supabaseAdmin.auth.getUser(input.accessToken);
  const user = auth.data.user;
  if (auth.error || !user) throw new Error("Your Solaris sign-in has expired. Sign in again.");

  const db = supabaseAdmin as any;
  const tv = db.schema("televoting");
  const [accountResult, showResult] = await Promise.all([
    db.from("country_accounts").select("country_id").eq("user_id", user.id).single(),
    db.from("shows").select("id,edition_id,name").eq("id", input.showId).single(),
  ]);
  if (accountResult.error) throw new Error(accountResult.error.message);
  if (showResult.error) throw new Error(showResult.error.message);

  const account = accountResult.data as { country_id: string };
  const show = showResult.data as { id: string; edition_id: string; name: string };
  const canonical = await loadCanonicalVotingContextServer();
  const settings = await loadFriendVotingSettingsServer();
  const country = canonical.hod.countriesById.get(String(account.country_id)) as any;
  if (!country) throw new Error("Country identity is unavailable");
  const countryId = String(account.country_id);
  const countryCode = upper(country.short_code ?? country.name);
  const currentHod = canonical.hod.resolve(String(show.edition_id), countryId, "jury");
  const edition = canonical.hod.editionsById.get(String(show.edition_id)) as any;
  const currentEditionNumber = edition?.edition_number == null ? null : Number(edition.edition_number);
  const editionNumber = (id: string) => {
    const row = canonical.hod.editionsById.get(String(id)) as any;
    return row?.edition_number == null ? null : Number(row.edition_number);
  };

  const [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult] = await Promise.all([
    tv.from("rounds").select("id,edition_id,status").order("created_at", { ascending: true }),
    tv.from("vote_submissions").select("id,round_id,country_code,status,deletion_category").limit(50000),
    tv.from("vote_entries").select("submission_id,target_country_code,points").limit(250000),
    tv.from("round_entries").select("round_id,entry_key,country_code"),
  ]);
  for (const result of [roundsResult, submissionsResult, voteEntriesResult, roundEntriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const rounds = (roundsResult.data ?? []) as RoundRow[];
  const canonicalEditionByRound = new Map<string, string>();
  for (const round of rounds) {
    const id = canonicalEditionForRound(canonical, round);
    if (id) canonicalEditionByRound.set(round.id, id);
  }

  const participantCodesByRound = new Map<string, Set<string>>();
  const entryCode = new Map<string, string>();
  for (const row of (roundEntriesResult.data ?? []) as RoundEntryRow[]) {
    const code = upper(row.country_code);
    if (!code) continue;
    entryCode.set(`${row.round_id}:${row.entry_key}`, code);
    const set = participantCodesByRound.get(row.round_id) ?? new Set<string>();
    set.add(code);
    participantCodesByRound.set(row.round_id, set);
  }

  const entriesBySubmission = new Map<string, VoteEntryRow[]>();
  for (const row of (voteEntriesResult.data ?? []) as VoteEntryRow[]) {
    const list = entriesBySubmission.get(row.submission_id) ?? [];
    list.push(row);
    entriesBySubmission.set(row.submission_id, list);
  }

  const raw: RawObservation[] = [];
  for (const submission of ((submissionsResult.data ?? []) as SubmissionRow[]).filter(useSubmission)) {
    const historicalEditionId = canonicalEditionByRound.get(submission.round_id);
    if (!historicalEditionId) continue;
    const voterCode = upper(submission.country_code);
    const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
    const voterCountryId = voterCountry?.id ? String(voterCountry.id) : null;
    const hod = canonical.hod.resolve(historicalEditionId, voterCountryId, "televote");
    const ballot = entriesBySubmission.get(submission.id) ?? [];
    const score = new Map<string, number>();
    for (const row of ballot) {
      const code = entryCode.get(`${submission.round_id}:${row.target_country_code}`) ?? upper(row.target_country_code);
      if (code) score.set(code, Number(row.points ?? 0));
    }
    const targets = [...(participantCodesByRound.get(submission.round_id) ?? new Set<string>())].filter((code) => code !== voterCode);
    const rows = targets.map((target) => ({ target, score: score.get(target) ?? 0 }));
    const rankMap = ranks(rows);
    const maxScore = Math.max(0, ...rows.map((row) => row.score));
    for (const row of rows) raw.push({
      editionId: historicalEditionId,
      editionNumber: editionNumber(historicalEditionId),
      channel: "televote",
      voterCode,
      hodPersonId: hod?.personId ?? null,
      targetCode: row.target,
      score: row.score,
      maxScore,
      supported: row.score > 0,
      maximum: row.score > 0 && row.score === maxScore,
      rank: rankMap.get(row.target) ?? null,
      participantCount: rows.length,
    });
  }

  const juryByBallot = new Map<string, typeof canonical.juryVotes>();
  for (const vote of canonical.juryVotes) {
    if (!vote.voter_country_id) continue;
    const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
    const list = juryByBallot.get(key) ?? [];
    list.push(vote);
    juryByBallot.set(key, list);
  }

  const currentShowBallots: SimilarityBallot[] = [];
  for (const ballotVotes of juryByBallot.values()) {
    const first = ballotVotes[0];
    if (!first?.voter_country_id) continue;
    const voterCountry = canonical.hod.countriesById.get(first.voter_country_id) as any;
    if (!voterCountry) continue;
    const voterCode = upper(voterCountry.short_code ?? voterCountry.name);
    const hod = canonical.hod.resolve(String(first.edition_id), String(first.voter_country_id), "jury");
    const participantIds = first.show_id
      ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
      : canonical.editionParticipants.get(String(first.edition_id)) ?? new Set<string>();
    const scoreByTarget = new Map<string, number>();
    for (const vote of ballotVotes) {
      if (!vote.receiving_country_id) continue;
      const target = canonical.hod.countriesById.get(vote.receiving_country_id) as any;
      if (target) scoreByTarget.set(upper(target.short_code ?? target.name), Number(vote.points ?? 0));
    }
    const rows: Array<{ target: string; score: number }> = [];
    for (const targetId of participantIds) {
      if (targetId === first.voter_country_id) continue;
      const target = canonical.hod.countriesById.get(targetId) as any;
      if (!target) continue;
      const targetCode = upper(target.short_code ?? target.name);
      rows.push({ target: targetCode, score: scoreByTarget.get(targetCode) ?? 0 });
    }
    const rankMap = ranks(rows);
    const maxScore = Math.max(0, ...rows.map((row) => row.score));
    for (const row of rows) raw.push({
      editionId: String(first.edition_id),
      editionNumber: editionNumber(String(first.edition_id)),
      channel: "jury",
      voterCode,
      hodPersonId: hod?.personId ?? null,
      targetCode: row.target,
      score: row.score,
      maxScore,
      supported: row.score > 0,
      maximum: row.score > 0 && row.score === maxScore,
      rank: rankMap.get(row.target) ?? null,
      participantCount: rows.length,
    });
    if (String(first.show_id ?? "") === String(show.id) && String(first.voter_country_id) !== countryId) {
      currentShowBallots.push({ voterId: voterCode, allocations: Object.fromEntries(rows.map((row) => [row.target, row.score])) });
    }
  }

  const currentParticipants = canonical.participantsByShow.get(String(show.id)) ?? new Set<string>();
  const participantCodes: string[] = [];
  const targetCodeById = new Map<string, string>();
  const targetName = new Map<string, string>();
  for (const targetId of currentParticipants) {
    const target = canonical.hod.countriesById.get(targetId) as any;
    if (!target) continue;
    const code = upper(target.short_code ?? target.name);
    participantCodes.push(code);
    targetCodeById.set(targetId, code);
    targetName.set(code, String(target.name ?? code));
  }
  const currentAllocations: Record<string, number> = {};
  for (const entry of input.entries) {
    const code = targetCodeById.get(entry.target_country_id);
    if (code) currentAllocations[code] = Number(entry.points);
  }
  const currentRows = participantCodes
    .filter((code) => code !== countryCode)
    .map((target) => ({ target, score: currentAllocations[target] ?? 0 }));
  const currentRanks = ranks(currentRows);
  const currentMax = Math.max(0, ...currentRows.map((row) => row.score));
  for (const row of currentRows) raw.push({
    editionId: String(show.edition_id),
    editionNumber: currentEditionNumber,
    channel: "jury",
    voterCode: countryCode,
    hodPersonId: currentHod?.personId ?? null,
    targetCode: row.target,
    score: row.score,
    maxScore: currentMax,
    supported: row.score > 0,
    maximum: row.score > 0 && row.score === currentMax,
    rank: currentRanks.get(row.target) ?? null,
    participantCount: currentRows.length,
  });

  const similarity = calculateBallotSimilarityRisk({
    current: { voterId: countryCode, allocations: currentAllocations },
    others: currentShowBallots,
    participants: participantCodes,
  });

  const supportedTargets = currentRows.filter((row) => row.score > 0).map((row) => row.target);
  const findings: VoteIntegrityFinding[] = [];
  for (const targetCode of supportedTargets) {
    const common = {
      rows: raw,
      all: raw,
      targetCode,
      targetName: targetName.get(targetCode) ?? targetCode,
      countryCode,
      hodPersonId: currentHod?.personId ?? null,
      currentEditionNumber,
      similarityRisk: similarity.risk,
      settings,
    };
    const countryFinding = findingFor({ ...common, lens: "country" });
    if (countryFinding) findings.push(countryFinding);
    const hodFinding = findingFor({ ...common, lens: "hod" });
    if (hodFinding) findings.push(hodFinding);
  }
  findings.sort((a, b) => b.riskScore - a.riskScore || b.confidence - a.confidence);

  const relationshipRisk = Math.max(0, ...findings.map((row) => row.riskScore));
  const confidence = Math.max(0, ...findings.map((row) => row.confidence));
  const riskScore = Math.min(100, Math.max(relationshipRisk, similarity.risk));
  const strongSignalCount = [
    relationshipRisk,
    similarity.risk,
    Math.max(0, ...findings.map((row) => row.continuityRisk ?? 0)),
  ].filter((value) => value >= 65).length;
  const interventionLevel = resolveIntegrityIntervention({
    risk: riskScore,
    confidence,
    strongSignalCount,
    currentCoordinationEvidence: similarity.currentCoordinationEvidence,
  });
  const requiresAttestation = interventionRequiresAttestation(interventionLevel);
  const severity = severityForRisk(riskScore, settings);
  const effectiveRecent = Math.max(0, ...findings.map((row) => row.effectiveRecentEditions ?? 0));
  const reasonCategories = [
    relationshipRisk >= settings.riskNotable ? "historical_relationship" : null,
    findings.some((row) => row.reciprocalSupport >= 60) ? "reciprocal_pattern" : null,
    similarity.risk >= 45 ? "unusual_similarity" : null,
    findings.some((row) => (row.continuityRisk ?? 0) >= 65) ? "persistent_recent_pattern" : null,
  ].filter((value): value is string => Boolean(value));

  const history = {
    ...base.history,
    effectiveRecentEditions: effectiveRecent,
    effectiveLifetimeEditions: Math.max(effectiveRecent, ...findings.map((row) => row.uniqueEditions)),
  };
  const adminEvidence = {
    similarity: {
      risk: similarity.risk,
      strongestSimilarity: similarity.strongestSimilarity,
      baselineMean: similarity.baselineMean,
      baselineSd: similarity.baselineSd,
      zScore: similarity.zScore,
      matchedVoterId: similarity.matchedVoterId,
      currentCoordinationEvidence: similarity.currentCoordinationEvidence,
    },
    recentHistory: {
      decay: 0.88,
      fourEditionsAgoWeight: recentEditionWeight(4),
      recentShare: 0.75,
      lifetimeShare: 0.25,
    },
  };

  const { error: updateError } = await tv
    .from("vote_preflight_checks")
    .update({
      relationship_risk: relationshipRisk,
      risk_score: riskScore,
      confidence,
      severity,
      intervention_level: interventionLevel,
      requires_attestation: requiresAttestation,
      findings: findings.filter((row) => row.riskScore >= settings.riskNotable).slice(0, 10),
      history_summary: history,
      statement_version: 2,
      model_version: FRIEND_VOTING_MODEL_VERSION,
      voter_reason_categories: reasonCategories,
      admin_evidence: adminEvidence,
    })
    .eq("id", base.token)
    .is("submitted_at", null);
  if (updateError) throw new Error(updateError.message);

  return {
    ...base,
    modelVersion: FRIEND_VOTING_MODEL_VERSION,
    relationshipRisk,
    riskScore,
    confidence,
    severity,
    interventionLevel,
    requiresAttestation,
    reasonCategories,
    findings: findings.filter((row) => row.riskScore >= settings.riskNotable).slice(0, 10),
    history,
  };
}
