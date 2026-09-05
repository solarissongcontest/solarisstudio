import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { loadCanonicalVotingContextServer, canonicalEditionForRound } from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  calculateAdvancedFriendVotingRisk,
  FRIEND_VOTING_MODEL_VERSION,
  type AdvancedFriendVotingConfig,
  type AdvancedFriendVotingObservation,
} from "@/integrations/televoting/advanced-friend-voting";

export type IntelligenceLens = "hod" | "country";
export type IntelligenceChannel = "combined" | "televote" | "jury";
export type IntelligenceOptions = {
  lens?: IntelligenceLens;
  channel?: IntelligenceChannel;
  hodPersonId?: string | null;
  editionId?: string | null;
  advancedModel?: AdvancedFriendVotingConfig;
};

export type IntelligencePair = {
  identityKey: string;
  controllerPersonId: string | null;
  controllerName: string | null;
  votingCountry: string;
  votingCountries: string[];
  targetCountry: string;
  targetCode: string;
  opportunities: number;
  supported: number;
  supportFrequency: number;
  maximumScores: number;
  maximumFrequency: number;
  points: number;
  averagePoints: number;
  normalizedAverage: number;
  reciprocalSupport: number;
  uniqueEditions: number;
  crossChannelEditions: number;
  televoteOpportunities: number;
  televoteSupportFrequency: number;
  televotePoints: number;
  juryOpportunities: number;
  jurySupportFrequency: number;
  juryPoints: number;
  riskScore: number;
  confidence: number;
  reasons: string[];
  warnings: string[];
  juryRisk: number;
  televoteRisk: number;
  crossChannelRisk: number;
  relationshipAnomaly: number;
  reciprocityRisk: number;
  intensityRisk: number;
  historicalDeviationRisk: number;
  rankPatternRisk: number;
  networkRisk: number;
  countryStrengthRisk: number;
  evidence: {
    observedSupport: number;
    eligibleSupport: number;
    smoothedSupportRate: number;
    averageScore: number;
    expectedAverageScore: number;
    maximumScores: number;
    reciprocalEditions: number;
    reciprocalSupportEditions: number;
    crossChannelEditions: number;
    historicalMaxScoreRate: number;
    observedRankPercentile: number;
    expectedRankPercentile: number;
  };
  modelVersion: string;
};

export type IntelligenceSignal = {
  key: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  count: number;
  countries: string[];
};

type Submission = {
  id: string;
  round_id: string;
  country_code: string;
  username: string;
  username_normalized: string;
  ip_country: string | null;
  is_vpn: boolean;
  risk_score: number;
  status: string | null;
  created_at: string;
};
type Entry = { submission_id: string; target_country_code: string; points: number };
type RoundEntry = { round_id: string; entry_key: string; country_code: string | null };
type Round = { id: string; name: string; edition_id: string; status: string };
type Country = { code: string; name: string };
type Observation = {
  lensIdentity: string;
  controllerPersonId: string | null;
  controllerName: string | null;
  editionId: string;
  showOrRoundId: string;
  channel: "televote" | "jury";
  voterCountryCode: string;
  targetCountryCode: string;
  score: number;
  maxScore: number;
  supported: boolean;
  maximum: boolean;
  normalized: number;
  rank: number | null;
  participantCount: number;
};
type PairAccumulator = {
  identityKey: string;
  controllerPersonId: string | null;
  controllerName: string | null;
  votingCountries: Set<string>;
  targetCode: string;
  opportunities: number;
  supported: number;
  max: number;
  points: number;
  editions: Set<string>;
  televote: { opportunities: number; supported: number; points: number; max: number };
  jury: { opportunities: number; supported: number; points: number; max: number };
  supportChannelsByEdition: Map<string, Set<string>>;
  maximumEditions: Set<string>;
  observations: Observation[];
};
type Coverage = { editionId: string; voterCode: string; personId: string | null };

const pct = (value: number) => Math.round(value * 1000) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

function ranksForScores(rows: Array<{ target: string; score: number }>) {
  const scores = [...new Set(rows.map((row) => row.score))].sort((a, b) => b - a);
  const rankByScore = new Map<number, number>();
  let position = 1;
  for (const score of scores) {
    rankByScore.set(score, position);
    position += rows.filter((row) => row.score === score).length;
  }
  return new Map(rows.map((row) => [row.target, rankByScore.get(row.score) ?? rows.length]));
}

function advancedObservation(row: Observation): AdvancedFriendVotingObservation {
  return {
    editionId: row.editionId,
    channel: row.channel,
    voterId: row.lensIdentity,
    targetCode: row.targetCountryCode,
    score: row.score,
    maxScore: row.maxScore,
    supported: row.supported,
    maximum: row.maximum,
    rank: row.rank,
    participantCount: row.participantCount,
  };
}

export async function getMergedIntelligenceServer(options: IntelligenceOptions = {}) {
  await requireMergedTelevotingAdminServer();
  const lens: IntelligenceLens = options.lens === "country" ? "country" : "hod";
  const channel: IntelligenceChannel = options.channel === "jury" || options.channel === "televote" ? options.channel : "combined";
  const canonical = await loadCanonicalVotingContextServer();

  const [submissionResult, roundResult, roundEntryResult, countryResult, voteEntryResult] = await Promise.all([
    televotingAdmin
      .from("vote_submissions")
      .select("id,round_id,country_code,username,username_normalized,ip_country,is_vpn,risk_score,status,created_at")
      .order("created_at", { ascending: true })
      .limit(50000),
    televotingAdmin.from("rounds").select("id,name,edition_id,status").order("created_at", { ascending: true }),
    televotingAdmin.from("round_entries").select("round_id,entry_key,country_code"),
    televotingAdmin.from("countries").select("code,name"),
    televotingAdmin.from("vote_entries").select("submission_id,target_country_code,points").limit(250000),
  ]);

  for (const result of [submissionResult, roundResult, roundEntryResult, countryResult, voteEntryResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const allSubmissions = (submissionResult.data ?? []) as Submission[];
  const activeSubmissions = allSubmissions.filter((submission) => submission.status !== "deleted");
  const rounds = (roundResult.data ?? []) as Round[];
  const roundEntries = (roundEntryResult.data ?? []) as RoundEntry[];
  const countries = (countryResult.data ?? []) as Country[];
  const voteEntries = (voteEntryResult.data ?? []) as Entry[];

  const countryName = new Map(countries.map((country) => [String(country.code).toUpperCase(), country.name]));
  for (const country of canonical.hod.countries) {
    const code = String((country as any).short_code ?? "").toUpperCase();
    if (code && !countryName.has(code)) countryName.set(code, String((country as any).name));
  }

  const countriesWithHodHistory = new Set(
    canonical.hod.assignments.map((assignment: any) => String(assignment.country_id)),
  );
  const useCountryFallback = (countryId: string | null | undefined) =>
    lens === "hod" && Boolean(countryId) && !countriesWithHodHistory.has(String(countryId));

  const canonicalEditionByRound = new Map<string, string>();
  for (const round of rounds) {
    const editionId = canonicalEditionForRound(canonical, round);
    if (editionId) canonicalEditionByRound.set(round.id, editionId);
  }

  const participantsByRound = new Map<string, Set<string>>();
  for (const entry of roundEntries) {
    const target = String(entry.country_code || entry.entry_key || "").trim().toUpperCase();
    if (!target) continue;
    const set = participantsByRound.get(entry.round_id) ?? new Set<string>();
    set.add(target);
    participantsByRound.set(entry.round_id, set);
  }

  const activeSubmissionIds = new Set(activeSubmissions.map((submission) => submission.id));
  const entriesBySubmission = new Map<string, Entry[]>();
  for (const entry of voteEntries) {
    if (!activeSubmissionIds.has(entry.submission_id)) continue;
    const list = entriesBySubmission.get(entry.submission_id) ?? [];
    list.push(entry);
    entriesBySubmission.set(entry.submission_id, list);
  }

  const allObservations: Observation[] = [];
  const coverage: Coverage[] = [];

  if (channel !== "jury") {
    for (const submission of activeSubmissions) {
      const editionId = canonicalEditionByRound.get(submission.round_id);
      if (!editionId) continue;
      const voterCode = String(submission.country_code).trim().toUpperCase();
      const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
      const countryId = voterCountry?.id ? String(voterCountry.id) : null;
      const hod = canonical.hod.resolve(editionId, countryId, "televote");
      const countryFallback = !hod && useCountryFallback(countryId);
      coverage.push({ editionId, voterCode, personId: hod?.personId ?? null });
      if (lens === "hod" && !hod && !countryFallback) continue;

      const identity = lens === "country"
        ? `country:${voterCode}`
        : hod
          ? `hod:${hod.personId}`
          : `country-fallback:${voterCode}`;
      const ballotEntries = entriesBySubmission.get(submission.id) ?? [];
      const points = new Map(ballotEntries.map((entry) => [String(entry.target_country_code).trim().toUpperCase(), Number(entry.points || 0)]));
      const targets = [...(participantsByRound.get(submission.round_id) ?? new Set<string>())].filter((target) => target && target !== voterCode);
      const scoreRows = targets.map((target) => ({ target, score: points.get(target) ?? 0 }));
      const rankByTarget = ranksForScores(scoreRows);
      const maxScore = Math.max(0, ...scoreRows.map((row) => row.score));

      for (const { target, score } of scoreRows) {
        allObservations.push({
          lensIdentity: identity,
          controllerPersonId: hod?.personId ?? null,
          controllerName: lens === "hod" && hod ? hod.displayName : null,
          editionId,
          showOrRoundId: submission.round_id,
          channel: "televote",
          voterCountryCode: voterCode,
          targetCountryCode: target,
          score,
          maxScore,
          supported: score > 0,
          maximum: score > 0 && score === maxScore,
          normalized: maxScore > 0 ? score / maxScore : 0,
          rank: rankByTarget.get(target) ?? null,
          participantCount: scoreRows.length,
        });
      }
    }
  }

  if (channel !== "televote") {
    const votesByBallot = new Map<string, typeof canonical.juryVotes>();
    for (const vote of canonical.juryVotes) {
      if (!vote.voter_country_id) continue;
      const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
      const list = votesByBallot.get(key) ?? [];
      list.push(vote);
      votesByBallot.set(key, list);
    }

    for (const [ballotKey, ballotVotes] of votesByBallot) {
      const first = ballotVotes[0];
      if (!first?.voter_country_id) continue;
      const editionId = String(first.edition_id);
      const voterCountry = canonical.hod.countriesById.get(first.voter_country_id) as any;
      if (!voterCountry) continue;
      const voterCode = String(voterCountry.short_code ?? voterCountry.name).toUpperCase();
      const countryId = String(first.voter_country_id);
      const hod = canonical.hod.resolve(editionId, countryId, "jury");
      const countryFallback = !hod && useCountryFallback(countryId);
      coverage.push({ editionId, voterCode, personId: hod?.personId ?? null });
      if (lens === "hod" && !hod && !countryFallback) continue;

      const identity = lens === "country"
        ? `country:${voterCode}`
        : hod
          ? `hod:${hod.personId}`
          : `country-fallback:${voterCode}`;
      const scoreByTarget = new Map<string, number>();
      for (const vote of ballotVotes) {
        if (!vote.receiving_country_id) continue;
        const target = canonical.hod.countriesById.get(vote.receiving_country_id) as any;
        if (target) scoreByTarget.set(String(target.short_code ?? target.name).toUpperCase(), Number(vote.points ?? 0));
      }

      const participantIds = first.show_id
        ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
        : canonical.editionParticipants.get(editionId) ?? new Set<string>();
      const scoreRows: Array<{ target: string; score: number }> = [];
      for (const targetCountryId of participantIds) {
        if (targetCountryId === first.voter_country_id) continue;
        const target = canonical.hod.countriesById.get(targetCountryId) as any;
        if (!target) continue;
        const targetCode = String(target.short_code ?? target.name).toUpperCase();
        scoreRows.push({ target: targetCode, score: scoreByTarget.get(targetCode) ?? 0 });
      }
      const rankByTarget = ranksForScores(scoreRows);
      const maxScore = Math.max(0, ...scoreRows.map((row) => row.score));

      for (const { target, score } of scoreRows) {
        allObservations.push({
          lensIdentity: identity,
          controllerPersonId: hod?.personId ?? null,
          controllerName: lens === "hod" && hod ? hod.displayName : null,
          editionId,
          showOrRoundId: String(first.show_id ?? ballotKey),
          channel: "jury",
          voterCountryCode: voterCode,
          targetCountryCode: target,
          score,
          maxScore,
          supported: score > 0,
          maximum: score > 0 && score === maxScore,
          normalized: maxScore > 0 ? score / maxScore : 0,
          rank: rankByTarget.get(target) ?? null,
          participantCount: scoreRows.length,
        });
      }
    }
  }

  const observations = allObservations.filter((observation) => {
    if (options.editionId && observation.editionId !== options.editionId) return false;
    if (options.hodPersonId && observation.controllerPersonId !== options.hodPersonId) return false;
    return true;
  });

  const observationLookup = new Map<string, Observation[]>();
  for (const observation of allObservations) {
    const key = `${observation.editionId}:${observation.channel}:${observation.voterCountryCode}:${observation.targetCountryCode}`;
    const list = observationLookup.get(key) ?? [];
    list.push(observation);
    observationLookup.set(key, list);
  }

  const pairs = new Map<string, PairAccumulator>();
  for (const observation of observations) {
    const key = `${observation.lensIdentity}\u0000${observation.targetCountryCode}`;
    const current = pairs.get(key) ?? {
      identityKey: observation.lensIdentity,
      controllerPersonId: observation.controllerPersonId,
      controllerName: observation.controllerName,
      votingCountries: new Set<string>(),
      targetCode: observation.targetCountryCode,
      opportunities: 0,
      supported: 0,
      max: 0,
      points: 0,
      editions: new Set<string>(),
      televote: { opportunities: 0, supported: 0, points: 0, max: 0 },
      jury: { opportunities: 0, supported: 0, points: 0, max: 0 },
      supportChannelsByEdition: new Map<string, Set<string>>(),
      maximumEditions: new Set<string>(),
      observations: [],
    };
    current.votingCountries.add(observation.voterCountryCode);
    current.opportunities += 1;
    current.points += observation.score;
    current.editions.add(observation.editionId);
    current.observations.push(observation);
    if (observation.supported) {
      current.supported += 1;
      const channels = current.supportChannelsByEdition.get(observation.editionId) ?? new Set<string>();
      channels.add(observation.channel);
      current.supportChannelsByEdition.set(observation.editionId, channels);
    }
    if (observation.maximum) {
      current.max += 1;
      current.maximumEditions.add(observation.editionId);
    }
    const bucket = current[observation.channel];
    bucket.opportunities += 1;
    bucket.points += observation.score;
    if (observation.supported) bucket.supported += 1;
    if (observation.maximum) bucket.max += 1;
    pairs.set(key, current);
  }

  const advancedAll = allObservations.map(advancedObservation);
  const relationships: IntelligencePair[] = [];

  for (const value of pairs.values()) {
    const uniqueEditions = value.editions.size;
    const supportFrequency = uniqueEditions ? value.supportChannelsByEdition.size / uniqueEditions : 0;
    const maximumFrequency = uniqueEditions ? value.maximumEditions.size / uniqueEditions : 0;
    const normalizedByEdition = new Map<string, number[]>();
    for (const row of value.observations) {
      const list = normalizedByEdition.get(row.editionId) ?? [];
      list.push(row.normalized);
      normalizedByEdition.set(row.editionId, list);
    }
    const normalizedAverage = normalizedByEdition.size
      ? [...normalizedByEdition.values()].reduce(
          (sum, rows) => sum + rows.reduce((a, b) => a + b, 0) / Math.max(1, rows.length),
          0,
        ) / normalizedByEdition.size
      : 0;

    const reciprocalByEdition = new Set<string>();
    for (const row of value.observations) {
      const reverse = observationLookup.get(`${row.editionId}:${row.channel}:${row.targetCountryCode}:${row.voterCountryCode}`);
      if (row.supported && reverse?.some((candidate) => candidate.supported)) reciprocalByEdition.add(row.editionId);
    }
    const reciprocalEditions = reciprocalByEdition.size;
    const reciprocalSupport = uniqueEditions ? reciprocalEditions / uniqueEditions : 0;
    const crossChannelEditions = [...value.supportChannelsByEdition.values()].filter(
      (channels) => channels.has("jury") && channels.has("televote"),
    ).length;

    const advanced = calculateAdvancedFriendVotingRisk(
      value.observations.map(advancedObservation),
      advancedAll,
      reciprocalSupport,
      reciprocalEditions,
      null,
      options.advancedModel,
    );

    const votingCodes = [...value.votingCountries].sort();
    const votingNames = votingCodes.map((code) => countryName.get(code) ?? code);
    const targetName = countryName.get(value.targetCode) ?? value.targetCode;
    const televoteFrequency = value.televote.opportunities ? value.televote.supported / value.televote.opportunities : 0;
    const juryFrequency = value.jury.opportunities ? value.jury.supported / value.jury.opportunities : 0;
    const countryFallback = value.identityKey.startsWith("country-fallback:");

    relationships.push({
      identityKey: value.identityKey,
      controllerPersonId: value.controllerPersonId,
      controllerName: value.controllerName,
      votingCountry: votingNames.join(" / "),
      votingCountries: votingNames,
      targetCountry: targetName,
      targetCode: value.targetCode,
      opportunities: value.opportunities,
      supported: value.supported,
      supportFrequency: pct(supportFrequency),
      maximumScores: value.max,
      maximumFrequency: pct(maximumFrequency),
      points: value.points,
      averagePoints: round2(value.opportunities ? value.points / value.opportunities : 0),
      normalizedAverage: pct(normalizedAverage),
      reciprocalSupport: pct(reciprocalSupport),
      uniqueEditions,
      crossChannelEditions,
      televoteOpportunities: value.televote.opportunities,
      televoteSupportFrequency: pct(televoteFrequency),
      televotePoints: value.televote.points,
      juryOpportunities: value.jury.opportunities,
      jurySupportFrequency: pct(juryFrequency),
      juryPoints: value.jury.points,
      riskScore: advanced.overallRisk,
      confidence: advanced.confidence,
      reasons: advanced.reasons,
      warnings: countryFallback
        ? ["No HOD history is configured for this country, so analytics uses the country identity across all available editions.", ...advanced.warnings]
        : advanced.warnings,
      juryRisk: advanced.juryRisk,
      televoteRisk: advanced.televoteRisk,
      crossChannelRisk: advanced.crossChannelRisk,
      relationshipAnomaly: advanced.relationshipAnomaly,
      reciprocityRisk: advanced.reciprocityRisk,
      intensityRisk: advanced.intensityRisk,
      historicalDeviationRisk: advanced.historicalDeviationRisk,
      rankPatternRisk: advanced.rankPatternRisk,
      networkRisk: advanced.networkRisk,
      countryStrengthRisk: advanced.countryStrengthRisk,
      evidence: advanced.evidence,
      modelVersion: FRIEND_VOTING_MODEL_VERSION,
    });
  }

  relationships.sort(
    (a, b) => b.riskScore - a.riskScore || b.uniqueEditions - a.uniqueEditions || b.opportunities - a.opportunities,
  );

  const submissionInScope = (submission: Submission) => {
    if (submission.status === "deleted") return false;
    const editionId = canonicalEditionByRound.get(submission.round_id);
    if (!editionId) return false;
    if (options.editionId && editionId !== options.editionId) return false;
    if (options.hodPersonId) {
      const country = canonical.hod.countriesByCode.get(String(submission.country_code).trim().toUpperCase()) as any;
      if (canonical.hod.resolve(editionId, country?.id, "televote")?.personId !== options.hodPersonId) return false;
    }
    return true;
  };
  const filteredSubmissions = allSubmissions.filter(submissionInScope);

  const juryVotesInScope = canonical.juryVotes.filter((vote) => {
    if (!vote.voter_country_id) return false;
    if (options.editionId && String(vote.edition_id) !== options.editionId) return false;
    if (options.hodPersonId && canonical.hod.resolve(vote.edition_id, vote.voter_country_id, "jury")?.personId !== options.hodPersonId) return false;
    return true;
  });

  const usernameCounts = new Map<string, Set<string>>();
  const vpnCountries = new Map<string, number>();
  const highRiskCountries = new Map<string, number>();
  const suspiciousCountries = new Map<string, number>();
  for (const submission of filteredSubmissions) {
    const user = submission.username_normalized || submission.username.toLowerCase();
    const countriesForUser = usernameCounts.get(user) ?? new Set<string>();
    countriesForUser.add(submission.country_code);
    usernameCounts.set(user, countriesForUser);
    if (submission.is_vpn) vpnCountries.set(submission.country_code, (vpnCountries.get(submission.country_code) ?? 0) + 1);
    if (Number(submission.risk_score ?? 0) >= 65) highRiskCountries.set(submission.country_code, (highRiskCountries.get(submission.country_code) ?? 0) + 1);
    if (submission.status === "suspicious") suspiciousCountries.set(submission.country_code, (suspiciousCountries.get(submission.country_code) ?? 0) + 1);
  }

  const multiCountryUsernames = [...usernameCounts.entries()].filter(([, codes]) => codes.size > 1);
  const signals: IntelligenceSignal[] = [];
  const pushSignal = (signal: IntelligenceSignal) => {
    if (signal.count > 0) signals.push(signal);
  };
  pushSignal({
    key: "suspicious",
    severity: suspiciousCountries.size > 5 ? "high" : "medium",
    title: "Ballots marked suspicious",
    description: "Moderator or automated integrity review has placed these ballots in the suspicious state.",
    count: [...suspiciousCountries.values()].reduce((a, b) => a + b, 0),
    countries: [...suspiciousCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(String(code).toUpperCase()) ?? code),
  });
  pushSignal({
    key: "high-risk",
    severity: "high",
    title: "High-risk ballots",
    description: "Ballots with stored technical/integrity risk score 65 or higher should receive organizer attention.",
    count: [...highRiskCountries.values()].reduce((a, b) => a + b, 0),
    countries: [...highRiskCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(String(code).toUpperCase()) ?? code),
  });
  pushSignal({
    key: "vpn",
    severity: "medium",
    title: "VPN / proxy evidence",
    description: "VPN evidence remains supporting technical information only. It never defines HOD identity or proves coordinated voting by itself.",
    count: [...vpnCountries.values()].reduce((a, b) => a + b, 0),
    countries: [...vpnCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(String(code).toUpperCase()) ?? code),
  });
  pushSignal({
    key: "username-cross-country",
    severity: multiCountryUsernames.length > 4 ? "high" : "medium",
    title: "Usernames seen across multiple countries",
    description: "Username reuse is supporting identity evidence. Historical HOD attribution comes from the canonical HOD assignment layer, not this heuristic.",
    count: multiCountryUsernames.length,
    countries: [...new Set(multiCountryUsernames.flatMap(([, codes]) => [...codes]))].slice(0, 8).map((code) => countryName.get(String(code).toUpperCase()) ?? code),
  });

  const scopedCoverage = coverage.filter((row) => {
    if (options.editionId && row.editionId !== options.editionId) return false;
    if (options.hodPersonId && row.personId !== options.hodPersonId) return false;
    return true;
  });
  const hodEditionCoverage = new Set(scopedCoverage.filter((row) => row.personId).map((row) => `${row.editionId}:${row.voterCode}`));
  const unknownHodEditionCoverage = new Set(scopedCoverage.filter((row) => !row.personId).map((row) => `${row.editionId}:${row.voterCode}`));
  const juryBallotCount = new Set(
    juryVotesInScope
      .filter((vote) => vote.voter_country_id)
      .map((vote) => `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`),
  ).size;

  const stats = {
    ballots: filteredSubmissions.length,
    active: filteredSubmissions.length,
    deleted: allSubmissions.filter((row) => row.status === "deleted").length,
    suspicious: filteredSubmissions.filter((row) => row.status === "suspicious").length,
    verified: filteredSubmissions.filter((row) => row.status === "verified").length,
    highRisk: filteredSubmissions.filter((row) => Number(row.risk_score ?? 0) >= 65).length,
    vpn: filteredSubmissions.filter((row) => row.is_vpn).length,
    rounds: rounds.length,
    juryBallots: juryBallotCount,
    juryVotes: juryVotesInScope.length,
    relationships: relationships.length,
    attentionRelationships: relationships.filter((row) => row.riskScore >= 50).length,
    hodAssignedEditionCountries: hodEditionCoverage.size,
    hodUnknownEditionCountries: unknownHodEditionCoverage.size,
  };

  return {
    stats,
    signals,
    relationships: relationships.slice(0, 750),
    filters: {
      lens,
      channel,
      hodPersonId: options.hodPersonId ?? null,
      editionId: options.editionId ?? null,
      people: canonical.hod.people,
      editions: canonical.hod.editions
        .map((edition: any) => ({
          id: String(edition.id),
          name: String(edition.name),
          editionNumber: edition.edition_number == null ? null : Number(edition.edition_number),
        }))
        .sort((a: any, b: any) => Number(b.editionNumber ?? 0) - Number(a.editionNumber ?? 0)),
    },
  };
}
