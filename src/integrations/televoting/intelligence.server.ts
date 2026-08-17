import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { loadCanonicalVotingContextServer, canonicalEditionForRound } from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type IntelligenceLens = "hod" | "country";
export type IntelligenceChannel = "combined" | "televote" | "jury";

export type IntelligenceOptions = {
  lens?: IntelligenceLens;
  channel?: IntelligenceChannel;
  hodPersonId?: string | null;
  editionId?: string | null;
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
  normalizedTotal: number;
  editions: Set<string>;
  televote: { opportunities: number; supported: number; points: number; max: number };
  jury: { opportunities: number; supported: number; points: number; max: number };
  supportChannelsByEdition: Map<string, Set<string>>;
  reciprocalOpportunities: number;
  reciprocalSupported: number;
};

const pct = (value: number) => Math.round(value * 1000) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

function displayEdition(edition: any) {
  return edition?.edition_number ? `SSC${edition.edition_number}` : String(edition?.name ?? "unknown edition");
}

export async function getMergedIntelligenceServer(options: IntelligenceOptions = {}) {
  await requireMergedTelevotingAdminServer();
  const lens: IntelligenceLens = options.lens === "country" ? "country" : "hod";
  const channel: IntelligenceChannel = ["jury", "televote"].includes(String(options.channel)) ? options.channel as IntelligenceChannel : "combined";
  const canonical = await loadCanonicalVotingContextServer();

  const [submissionResult, roundResult, roundEntryResult, countryResult] = await Promise.all([
    televotingAdmin.from("vote_submissions").select("id,round_id,country_code,username,username_normalized,ip_country,is_vpn,risk_score,status,created_at").order("created_at", { ascending: true }).limit(50000),
    televotingAdmin.from("rounds").select("id,name,edition_id,status").order("created_at", { ascending: true }),
    televotingAdmin.from("round_entries").select("round_id,entry_key,country_code"),
    televotingAdmin.from("countries").select("code,name"),
  ]);
  if (submissionResult.error) throw new Error(submissionResult.error.message);
  if (roundResult.error) throw new Error(roundResult.error.message);
  if (roundEntryResult.error) throw new Error(roundEntryResult.error.message);
  if (countryResult.error) throw new Error(countryResult.error.message);

  const allSubmissions = (submissionResult.data ?? []) as Submission[];
  const rounds = (roundResult.data ?? []) as Round[];
  const roundEntries = (roundEntryResult.data ?? []) as RoundEntry[];
  const countries = (countryResult.data ?? []) as Country[];
  const countryName = new Map(countries.map((country) => [String(country.code).toUpperCase(), country.name]));
  for (const country of canonical.hod.countries) {
    const code = String((country as any).short_code ?? "").toUpperCase();
    if (code && !countryName.has(code)) countryName.set(code, String((country as any).name));
  }

  const roundById = new Map(rounds.map((round) => [round.id, round]));
  const canonicalEditionByRound = new Map<string, string>();
  for (const round of rounds) {
    const canonicalId = canonicalEditionForRound(canonical, round);
    if (canonicalId) canonicalEditionByRound.set(round.id, canonicalId);
  }

  const filteredSubmissions = allSubmissions.filter((submission) => {
    if (submission.status === "deleted") return false;
    const editionId = canonicalEditionByRound.get(submission.round_id);
    if (options.editionId && editionId !== options.editionId) return false;
    if (options.hodPersonId) {
      const country = canonical.hod.countriesByCode.get(String(submission.country_code).trim().toUpperCase()) as any;
      const resolved = canonical.hod.resolve(editionId, country?.id, "televote");
      if (resolved?.personId !== options.hodPersonId) return false;
    }
    return true;
  });

  const ids = filteredSubmissions.map((row) => row.id);
  let entries: Entry[] = [];
  if (ids.length) {
    const result = await televotingAdmin.from("vote_entries").select("submission_id,target_country_code,points").in("submission_id", ids).limit(250000);
    if (result.error) throw new Error(result.error.message);
    entries = (result.data ?? []) as Entry[];
  }
  const entriesBySubmission = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = entriesBySubmission.get(entry.submission_id) ?? [];
    list.push(entry);
    entriesBySubmission.set(entry.submission_id, list);
  }

  const participantsByRound = new Map<string, Set<string>>();
  for (const entry of roundEntries) {
    const target = String(entry.country_code || entry.entry_key || "").toUpperCase();
    if (!target) continue;
    const set = participantsByRound.get(entry.round_id) ?? new Set<string>();
    set.add(target);
    participantsByRound.set(entry.round_id, set);
  }

  const observations: Observation[] = [];
  const hodEditionCoverage = new Set<string>();
  const unknownHodEditionCoverage = new Set<string>();

  if (channel !== "jury") {
    for (const submission of filteredSubmissions) {
      const editionId = canonicalEditionByRound.get(submission.round_id);
      if (!editionId) continue;
      const voterCode = String(submission.country_code).trim().toUpperCase();
      const voterCountry = canonical.hod.countriesByCode.get(voterCode) as any;
      const hod = canonical.hod.resolve(editionId, voterCountry?.id, "televote");
      const editionLabel = displayEdition(canonical.hod.editionsById.get(editionId));
      if (hod) hodEditionCoverage.add(`${editionId}:${voterCode}`);
      else unknownHodEditionCoverage.add(`${editionId}:${voterCode}`);
      const identity = lens === "country"
        ? `country:${voterCode}`
        : hod
          ? `hod:${hod.personId}`
          : `unknown:${editionId}:${voterCode}`;
      const ballotEntries = entriesBySubmission.get(submission.id) ?? [];
      const points = new Map(ballotEntries.map((entry) => [String(entry.target_country_code).toUpperCase(), Number(entry.points || 0)]));
      const maxScore = Math.max(0, ...points.values());
      for (const target of participantsByRound.get(submission.round_id) ?? new Set<string>()) {
        if (!target || target === voterCode) continue;
        const score = points.get(target) ?? 0;
        observations.push({
          lensIdentity: identity,
          controllerPersonId: hod?.personId ?? null,
          controllerName: lens === "hod" ? hod?.displayName ?? `HOD unknown · ${editionLabel}` : null,
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
        });
      }
    }
  }

  const juryVotesInScope = canonical.juryVotes.filter((vote) => {
    if (options.editionId && String(vote.edition_id) !== options.editionId) return false;
    if (!vote.voter_country_id) return false;
    if (options.hodPersonId) {
      const hod = canonical.hod.resolve(vote.edition_id, vote.voter_country_id, "jury");
      if (hod?.personId !== options.hodPersonId) return false;
    }
    return true;
  });

  if (channel !== "televote") {
    const votesByBallot = new Map<string, typeof juryVotesInScope>();
    for (const vote of juryVotesInScope) {
      const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
      const list = votesByBallot.get(key) ?? [];
      list.push(vote);
      votesByBallot.set(key, list);
    }
    for (const [ballotKey, ballotVotes] of votesByBallot) {
      const first = ballotVotes[0];
      if (!first?.voter_country_id) continue;
      const voterCountry = canonical.hod.countriesById.get(first.voter_country_id) as any;
      if (!voterCountry) continue;
      const voterCode = String(voterCountry.short_code ?? voterCountry.name).toUpperCase();
      const hod = canonical.hod.resolve(first.edition_id, first.voter_country_id, "jury");
      const editionLabel = displayEdition(canonical.hod.editionsById.get(first.edition_id));
      if (hod) hodEditionCoverage.add(`${first.edition_id}:${voterCode}`);
      else unknownHodEditionCoverage.add(`${first.edition_id}:${voterCode}`);
      const identity = lens === "country"
        ? `country:${voterCode}`
        : hod
          ? `hod:${hod.personId}`
          : `unknown:${first.edition_id}:${voterCode}`;
      const scoreByTarget = new Map<string, number>();
      for (const vote of ballotVotes) {
        if (!vote.receiving_country_id) continue;
        const target = canonical.hod.countriesById.get(vote.receiving_country_id) as any;
        if (!target) continue;
        scoreByTarget.set(String(target.short_code ?? target.name).toUpperCase(), Number(vote.points ?? 0));
      }
      const maxScore = Math.max(0, ...scoreByTarget.values());
      const participants = first.show_id
        ? canonical.participantsByShow.get(String(first.show_id)) ?? new Set<string>()
        : canonical.editionParticipants.get(String(first.edition_id)) ?? new Set<string>();
      for (const targetCountryId of participants) {
        if (targetCountryId === first.voter_country_id) continue;
        const target = canonical.hod.countriesById.get(targetCountryId) as any;
        if (!target) continue;
        const targetCode = String(target.short_code ?? target.name).toUpperCase();
        const score = scoreByTarget.get(targetCode) ?? 0;
        observations.push({
          lensIdentity: identity,
          controllerPersonId: hod?.personId ?? null,
          controllerName: lens === "hod" ? hod?.displayName ?? `HOD unknown · ${editionLabel}` : null,
          editionId: String(first.edition_id),
          showOrRoundId: String(first.show_id ?? ballotKey),
          channel: "jury",
          voterCountryCode: voterCode,
          targetCountryCode: targetCode,
          score,
          maxScore,
          supported: score > 0,
          maximum: score > 0 && score === maxScore,
          normalized: maxScore > 0 ? score / maxScore : 0,
        });
      }
    }
  }

  const observationLookup = new Map<string, Observation[]>();
  for (const observation of observations) {
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
      normalizedTotal: 0,
      editions: new Set<string>(),
      televote: { opportunities: 0, supported: 0, points: 0, max: 0 },
      jury: { opportunities: 0, supported: 0, points: 0, max: 0 },
      supportChannelsByEdition: new Map<string, Set<string>>(),
      reciprocalOpportunities: 0,
      reciprocalSupported: 0,
    };
    current.votingCountries.add(observation.voterCountryCode);
    current.opportunities += 1;
    current.points += observation.score;
    current.normalizedTotal += observation.normalized;
    current.editions.add(observation.editionId);
    if (observation.supported) {
      current.supported += 1;
      const channelSet = current.supportChannelsByEdition.get(observation.editionId) ?? new Set<string>();
      channelSet.add(observation.channel);
      current.supportChannelsByEdition.set(observation.editionId, channelSet);
    }
    if (observation.maximum) current.max += 1;
    const channelBucket = current[observation.channel];
    channelBucket.opportunities += 1;
    channelBucket.points += observation.score;
    if (observation.supported) channelBucket.supported += 1;
    if (observation.maximum) channelBucket.max += 1;

    const reverseKey = `${observation.editionId}:${observation.channel}:${observation.targetCountryCode}:${observation.voterCountryCode}`;
    const reverse = observationLookup.get(reverseKey);
    if (reverse?.length) {
      current.reciprocalOpportunities += 1;
      if (observation.supported && reverse.some((candidate) => candidate.supported)) current.reciprocalSupported += 1;
    }
    pairs.set(key, current);
  }

  const relationships: IntelligencePair[] = [];
  for (const value of pairs.values()) {
    const supportFrequency = value.opportunities ? value.supported / value.opportunities : 0;
    const maximumFrequency = value.opportunities ? value.max / value.opportunities : 0;
    const reciprocalSupport = value.reciprocalOpportunities ? value.reciprocalSupported / value.reciprocalOpportunities : 0;
    const normalizedAverage = value.opportunities ? value.normalizedTotal / value.opportunities : 0;
    const uniqueEditions = value.editions.size;
    const crossChannelEditions = [...value.supportChannelsByEdition.values()].filter((channels) => channels.has("jury") && channels.has("televote")).length;
    const sampleConfidence = Math.min(1, uniqueEditions / 4) * Math.min(1, value.opportunities / 8);
    let risk = sampleConfidence * 20;
    const reasons: string[] = [];

    if (uniqueEditions >= 3 && supportFrequency >= 0.75) {
      risk += 22;
      reasons.push(`Repeated support in ${pct(supportFrequency)}% of observed opportunities across ${uniqueEditions} editions`);
    }
    if (uniqueEditions >= 3 && maximumFrequency >= 0.45) {
      risk += 16;
      reasons.push(`Maximum-score concentration ${pct(maximumFrequency)}%`);
    }
    if (uniqueEditions >= 2 && reciprocalSupport >= 0.6) {
      risk += 16;
      reasons.push(`Reciprocal support in ${pct(reciprocalSupport)}% of comparable observations`);
    }
    if (uniqueEditions >= 2 && normalizedAverage >= 0.5) {
      risk += 10;
      reasons.push(`High score intensity (${pct(normalizedAverage)}% of available maximum on average)`);
    }
    if (crossChannelEditions >= 2) {
      risk += Math.min(10, crossChannelEditions * 3);
      reasons.push(`Same controller supported the target in both jury and televote in ${crossChannelEditions} editions`);
    }

    // Jury + televote made by one HOD in one edition are correlated evidence,
    // not two independent people. Confidence therefore comes from distinct
    // editions first, while cross-channel repetition adds only a modest bonus.
    if (uniqueEditions < 2) risk = Math.min(risk, 29);
    else if (uniqueEditions < 3) risk = Math.min(risk, 49);

    const votingCodes = [...value.votingCountries].sort();
    const votingNames = votingCodes.map((code) => countryName.get(code) ?? code);
    const targetName = countryName.get(value.targetCode) ?? value.targetCode;
    const identityLabel = lens === "hod"
      ? value.controllerName ?? votingNames.join(" / ")
      : votingNames.join(" / ");
    const televoteFrequency = value.televote.opportunities ? value.televote.supported / value.televote.opportunities : 0;
    const juryFrequency = value.jury.opportunities ? value.jury.supported / value.jury.opportunities : 0;

    relationships.push({
      identityKey: value.identityKey,
      controllerPersonId: value.controllerPersonId,
      controllerName: value.controllerName,
      votingCountry: identityLabel,
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
      riskScore: Math.min(100, Math.round(risk)),
      confidence: Math.round(sampleConfidence * 100),
      reasons,
    });
  }
  relationships.sort((a, b) => b.riskScore - a.riskScore || b.uniqueEditions - a.uniqueEditions || b.opportunities - a.opportunities);

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
  const pushSignal = (signal: IntelligenceSignal) => { if (signal.count > 0) signals.push(signal); };
  pushSignal({ key: "suspicious", severity: suspiciousCountries.size > 5 ? "high" : "medium", title: "Ballots marked suspicious", description: "Moderator or automated integrity review has placed these ballots in the suspicious state.", count: [...suspiciousCountries.values()].reduce((a, b) => a + b, 0), countries: [...suspiciousCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(String(code).toUpperCase()) ?? code) });
  pushSignal({ key: "high-risk", severity: "high", title: "High-risk ballots", description: "Ballots with stored technical/integrity risk score 65 or higher should receive organizer attention.", count: [...highRiskCountries.values()].reduce((a, b) => a + b, 0), countries: [...highRiskCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(String(code).toUpperCase()) ?? code) });
  pushSignal({ key: "vpn", severity: "medium", title: "VPN / proxy evidence", description: "VPN evidence remains supporting technical information only. It never defines HOD identity or proves coordinated voting by itself.", count: [...vpnCountries.values()].reduce((a, b) => a + b, 0), countries: [...vpnCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(String(code).toUpperCase()) ?? code) });
  pushSignal({ key: "username-cross-country", severity: multiCountryUsernames.length > 4 ? "high" : "medium", title: "Usernames seen across multiple countries", description: "Username reuse is supporting identity evidence. Historical HOD attribution comes from the canonical HOD assignment layer, not this heuristic.", count: multiCountryUsernames.length, countries: [...new Set(multiCountryUsernames.flatMap(([, codes]) => [...codes]))].slice(0, 8).map((code) => countryName.get(String(code).toUpperCase()) ?? code) });

  const juryBallotCount = new Set(juryVotesInScope.filter((vote) => vote.voter_country_id).map((vote) => `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`)).size;
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
      editions: canonical.hod.editions.map((edition: any) => ({ id: String(edition.id), name: String(edition.name), editionNumber: edition.edition_number == null ? null : Number(edition.edition_number) })).sort((a: any, b: any) => Number(b.editionNumber ?? 0) - Number(a.editionNumber ?? 0)),
    },
  };
}
