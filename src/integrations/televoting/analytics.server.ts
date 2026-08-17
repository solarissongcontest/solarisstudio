import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { loadCanonicalVotingContextServer, canonicalEditionForRound } from "@/integrations/televoting/canonical-context.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type MergedAnalysisScope =
  | { mode: "all_editions" }
  | { mode: "edition"; editionId: string }
  | { mode: "edition_range"; fromEditionId: string; toEditionId: string }
  | { mode: "round"; roundId: string };

export type MergedAnalyticsOptions = { hodPersonId?: string | null };

type EditionRow = { id: string; name: string; created_at: string };
type RoundRow = { id: string; name: string; edition_id: string; status: string; created_at: string };
type SubmissionRow = {
  id: string;
  round_id: string;
  country_code: string;
  username: string;
  username_normalized: string;
  created_at: string;
  status: string | null;
  risk_score: number;
  ip_country: string | null;
  is_vpn: boolean;
};
type VoteEntryRow = { submission_id: string; target_country_code: string; points: number };

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validateScope(scope: MergedAnalysisScope): MergedAnalysisScope {
  if (!scope || typeof scope !== "object") throw new Error("Invalid analysis scope");
  switch (scope.mode) {
    case "all_editions": return { mode: "all_editions" };
    case "edition":
      if (!scope.editionId) throw new Error("Missing edition");
      return { mode: "edition", editionId: String(scope.editionId) };
    case "edition_range":
      if (!scope.fromEditionId || !scope.toEditionId) throw new Error("Missing edition range");
      return { mode: "edition_range", fromEditionId: String(scope.fromEditionId), toEditionId: String(scope.toEditionId) };
    case "round":
      if (!scope.roundId) throw new Error("Missing round");
      return { mode: "round", roundId: String(scope.roundId) };
  }
}

async function resolveScope(scopeInput: MergedAnalysisScope) {
  const scope = validateScope(scopeInput);
  const [editionResult, roundResult] = await Promise.all([
    televotingAdmin.from("editions").select("id,name,created_at").order("created_at", { ascending: true }),
    televotingAdmin.from("rounds").select("id,name,edition_id,status,created_at").order("created_at", { ascending: true }),
  ]);
  if (editionResult.error) throw new Error(editionResult.error.message);
  if (roundResult.error) throw new Error(roundResult.error.message);

  const editions = (editionResult.data ?? []) as EditionRow[];
  const allRounds = (roundResult.data ?? []) as RoundRow[];
  let selectedRounds: RoundRow[];
  let selectedRemoteEditionIds = new Set<string>();

  if (scope.mode === "all_editions") {
    selectedRounds = allRounds;
    selectedRemoteEditionIds = new Set(editions.map((edition) => edition.id));
  } else if (scope.mode === "round") {
    selectedRounds = allRounds.filter((round) => round.id === scope.roundId);
    selectedRemoteEditionIds = new Set(selectedRounds.map((round) => round.edition_id));
  } else if (scope.mode === "edition") {
    selectedRounds = allRounds.filter((round) => round.edition_id === scope.editionId);
    selectedRemoteEditionIds = new Set([scope.editionId]);
  } else {
    const fromIndex = editions.findIndex((edition) => edition.id === scope.fromEditionId);
    const toIndex = editions.findIndex((edition) => edition.id === scope.toEditionId);
    if (fromIndex < 0 || toIndex < 0) throw new Error("Edition range could not be resolved");
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    selectedRemoteEditionIds = new Set(editions.slice(start, end + 1).map((edition) => edition.id));
    selectedRounds = allRounds.filter((round) => selectedRemoteEditionIds.has(round.edition_id));
  }

  return { scope, editions: editions.filter((edition) => selectedRemoteEditionIds.has(edition.id)), rounds: selectedRounds, allEditions: editions, allRounds, selectedRemoteEditionIds };
}

export async function getMergedScopedAnalyticsServer(scopeInput: MergedAnalysisScope, options: MergedAnalyticsOptions = {}) {
  await requireMergedTelevotingAdminServer();
  const [resolved, canonical] = await Promise.all([resolveScope(scopeInput), loadCanonicalVotingContextServer()]);
  const roundIds = resolved.rounds.map((round) => round.id);
  const roundCanonicalEdition = new Map<string, string>();
  for (const round of resolved.rounds) {
    const editionId = canonicalEditionForRound(canonical, round);
    if (editionId) roundCanonicalEdition.set(round.id, editionId);
  }

  let canonicalEditionIds = new Set<string>();
  if (resolved.scope.mode === "all_editions") {
    canonicalEditionIds = new Set(canonical.hod.editions.map((edition: any) => String(edition.id)));
  } else {
    for (const remoteEditionId of resolved.selectedRemoteEditionIds) {
      const canonicalId = canonical.remoteEditionToCanonical.get(remoteEditionId);
      if (canonicalId) canonicalEditionIds.add(canonicalId);
    }
    for (const editionId of roundCanonicalEdition.values()) canonicalEditionIds.add(editionId);
  }

  const selectedHod = options.hodPersonId ? canonical.hod.people.find((person) => person.id === options.hodPersonId) ?? null : null;

  let submissions: SubmissionRow[] = [];
  if (roundIds.length) {
    const result = await televotingAdmin.from("vote_submissions")
      .select("id,round_id,country_code,username,username_normalized,created_at,status,risk_score,ip_country,is_vpn")
      .in("round_id", roundIds).order("created_at", { ascending: true }).limit(50000);
    if (result.error) throw new Error(result.error.message);
    submissions = (result.data ?? []) as SubmissionRow[];
  }

  const validRawSubmissions = submissions.filter((submission) => submission.status !== "deleted");
  const televoteHodBySubmission = new Map<string, ReturnType<typeof canonical.hod.resolve>>();
  for (const submission of validRawSubmissions) {
    const country = canonical.hod.countriesByCode.get(String(submission.country_code).trim().toUpperCase()) as any;
    televoteHodBySubmission.set(submission.id, canonical.hod.resolve(roundCanonicalEdition.get(submission.round_id), country?.id, "televote"));
  }
  const eligibleSubmissions = selectedHod ? validRawSubmissions.filter((submission) => televoteHodBySubmission.get(submission.id)?.personId === selectedHod.id) : validRawSubmissions;
  const eligibleSubmissionMap = new Map(eligibleSubmissions.map((submission) => [submission.id, submission]));
  const eligibleIds = [...eligibleSubmissionMap.keys()];

  let entries: VoteEntryRow[] = [];
  if (eligibleIds.length) {
    const result = await televotingAdmin.from("vote_entries").select("submission_id,target_country_code,points").in("submission_id", eligibleIds).limit(250000);
    if (result.error) throw new Error(result.error.message);
    entries = (result.data ?? []) as VoteEntryRow[];
  }
  const entriesBySubmission = new Map<string, VoteEntryRow[]>();
  for (const entry of entries) {
    const list = entriesBySubmission.get(entry.submission_id) ?? [];
    list.push(entry);
    entriesBySubmission.set(entry.submission_id, list);
  }

  const countryResult = await televotingAdmin.from("countries").select("code,name,flag,flag_url");
  if (countryResult.error) throw new Error(countryResult.error.message);
  const roundEntryResult = roundIds.length
    ? await televotingAdmin.from("round_entries").select("round_id,entry_key,entry_type,country_code,custom_name,short_name,entry_code,subtitle,image_url").in("round_id", roundIds)
    : { data: [], error: null };
  if (roundEntryResult.error) throw new Error(roundEntryResult.error.message);

  const countries = countryResult.data ?? [];
  const countryLookup = new Map<string, (typeof countries)[number]>();
  const countryByCode = new Map(countries.map((country) => [String(country.code).toUpperCase(), country]));
  for (const country of countries) {
    countryLookup.set(normalizeIdentity(country.code), country);
    countryLookup.set(normalizeIdentity(country.name), country);
  }
  const entryCatalog = new Map<string, { name: string; code: string; image: string | null; flag: string | null }>();
  for (const entry of roundEntryResult.data ?? []) {
    const country = entry.country_code ? countryByCode.get(String(entry.country_code).toUpperCase()) : undefined;
    const catalog = { name: entry.custom_name || entry.short_name || country?.name || entry.entry_key, code: entry.entry_code || entry.country_code || entry.entry_key, image: entry.image_url || country?.flag_url || null, flag: country?.flag || null };
    entryCatalog.set(entry.entry_key, catalog);
    if (entry.country_code) entryCatalog.set(String(entry.country_code), catalog);
  }

  const juryRaw = canonical.juryVotes.filter((vote) => canonicalEditionIds.has(String(vote.edition_id)));
  const scopedJuryRaw = resolved.scope.mode === "round"
    ? juryRaw.filter((vote) => {
      const onlyRound = resolved.rounds[0];
      const binding = onlyRound ? canonical.roundBindings.get(onlyRound.id) : null;
      return !binding?.show_id || String(vote.show_id ?? "") === String(binding.show_id);
    })
    : juryRaw;
  const juryHodByBallotKey = new Map<string, ReturnType<typeof canonical.hod.resolve>>();
  for (const vote of scopedJuryRaw) {
    if (!vote.voter_country_id) continue;
    const key = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`;
    if (!juryHodByBallotKey.has(key)) juryHodByBallotKey.set(key, canonical.hod.resolve(vote.edition_id, vote.voter_country_id, "jury"));
  }
  const juryVotes = selectedHod ? scopedJuryRaw.filter((vote) => vote.voter_country_id && juryHodByBallotKey.get(`${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`)?.personId === selectedHod.id) : scopedJuryRaw;
  const juryBallotKeys = new Set(juryVotes.filter((vote) => vote.voter_country_id).map((vote) => `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`));
  const juryRawBallotKeys = new Set(scopedJuryRaw.filter((vote) => vote.voter_country_id).map((vote) => `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`));

  let totalBallotPoints = 0;
  let totalSupportedEntries = 0;
  let totalRisk = 0;
  let highRisk = 0;
  let vpnBallots = 0;
  for (const submission of eligibleSubmissions) {
    const ballotEntries = entriesBySubmission.get(submission.id) ?? [];
    totalBallotPoints += ballotEntries.reduce((sum, entry) => sum + Number(entry.points ?? 0), 0);
    totalSupportedEntries += ballotEntries.filter((entry) => Number(entry.points ?? 0) > 0).length;
    totalRisk += Number(submission.risk_score ?? 0);
    if (Number(submission.risk_score ?? 0) >= 65) highRisk += 1;
    if (submission.is_vpn) vpnBallots += 1;
  }
  const juryPoints = juryVotes.reduce((sum, vote) => sum + Number(vote.points ?? 0), 0);
  const overview = {
    ballots: eligibleSubmissions.length,
    voterCountries: new Set(eligibleSubmissions.map((submission) => normalizeIdentity(submission.country_code)).filter(Boolean)).size,
    editions: canonicalEditionIds.size || resolved.editions.length,
    rounds: resolved.rounds.length,
    avgBallotPoints: eligibleSubmissions.length ? totalBallotPoints / eligibleSubmissions.length : 0,
    avgSupported: eligibleSubmissions.length ? totalSupportedEntries / eligibleSubmissions.length : 0,
    avgRisk: eligibleSubmissions.length ? totalRisk / eligibleSubmissions.length : 0,
    highRisk,
    vpnBallots,
    juryBallots: juryBallotKeys.size,
    juryVotes: juryVotes.length,
    juryPoints,
    televotePoints: totalBallotPoints,
  };

  const editionAgg = new Map<string, any>();
  for (const editionId of canonicalEditionIds) {
    const edition = canonical.hod.editionsById.get(editionId) as any;
    editionAgg.set(editionId, { id: editionId, name: String(edition?.name ?? editionId), ballots: 0, voters: new Set<string>(), rounds: new Set<string>(), televotePoints: 0, juryBallots: new Set<string>(), juryVotes: 0, juryPoints: 0, editionNumber: Number(edition?.edition_number ?? 0) });
  }
  for (const submission of eligibleSubmissions) {
    const editionId = roundCanonicalEdition.get(submission.round_id);
    const bucket = editionId ? editionAgg.get(editionId) : null;
    if (!bucket) continue;
    bucket.ballots += 1;
    bucket.voters.add(normalizeIdentity(submission.country_code));
    bucket.rounds.add(submission.round_id);
    bucket.televotePoints += (entriesBySubmission.get(submission.id) ?? []).reduce((sum, entry) => sum + Number(entry.points ?? 0), 0);
  }
  for (const vote of juryVotes) {
    const bucket = editionAgg.get(String(vote.edition_id));
    if (!bucket) continue;
    bucket.juryBallots.add(`${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id ?? "unknown"}`);
    bucket.juryVotes += 1;
    bucket.juryPoints += Number(vote.points ?? 0);
  }
  const editionRows = [...editionAgg.values()].map((bucket) => ({ id: bucket.id, name: bucket.name, ballots: bucket.ballots, voterCountries: bucket.voters.size, rounds: bucket.rounds.size, points: bucket.televotePoints, avgBallot: bucket.ballots ? bucket.televotePoints / bucket.ballots : 0, juryBallots: bucket.juryBallots.size, juryVotes: bucket.juryVotes, juryPoints: bucket.juryPoints, editionNumber: bucket.editionNumber })).filter((row) => row.ballots > 0 || row.juryVotes > 0).sort((a, b) => b.editionNumber - a.editionNumber);

  const delegationAgg = new Map<string, any>();
  const ensureDelegation = (rawIdentity: string) => {
    const key = normalizeIdentity(rawIdentity) || rawIdentity;
    const current = delegationAgg.get(key) ?? { rawIdentity, ballots: 0, editions: new Set<string>(), rounds: new Set<string>(), totalPoints: 0, supportedEntries: 0, latest: new Date(0).toISOString(), totalRisk: 0, juryBallots: new Set<string>(), juryPoints: 0 };
    delegationAgg.set(key, current);
    return current;
  };
  for (const submission of eligibleSubmissions) {
    const current = ensureDelegation(submission.country_code);
    const ballotEntries = entriesBySubmission.get(submission.id) ?? [];
    const editionId = roundCanonicalEdition.get(submission.round_id);
    current.ballots += 1;
    if (editionId) current.editions.add(editionId);
    current.rounds.add(submission.round_id);
    current.totalPoints += ballotEntries.reduce((sum, entry) => sum + Number(entry.points ?? 0), 0);
    current.supportedEntries += ballotEntries.filter((entry) => Number(entry.points ?? 0) > 0).length;
    current.totalRisk += Number(submission.risk_score ?? 0);
    if (new Date(submission.created_at).getTime() > new Date(current.latest).getTime()) current.latest = submission.created_at;
  }
  for (const vote of juryVotes) {
    if (!vote.voter_country_id) continue;
    const canonicalCountry = canonical.hod.countriesById.get(vote.voter_country_id) as any;
    if (!canonicalCountry) continue;
    const current = ensureDelegation(String(canonicalCountry.short_code ?? canonicalCountry.name));
    current.editions.add(vote.edition_id);
    current.juryBallots.add(`${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`);
    current.juryPoints += Number(vote.points ?? 0);
  }
  const delegationRows = [...delegationAgg.values()].map((row) => {
    const country = countryLookup.get(normalizeIdentity(row.rawIdentity));
    const canonicalCountry = canonical.hod.countriesByCode.get(String(row.rawIdentity).trim().toUpperCase()) as any;
    return { identity: row.rawIdentity, name: country?.name ?? canonicalCountry?.name ?? (row.rawIdentity || "Unresolved voter"), code: country?.code ?? canonicalCountry?.short_code ?? row.rawIdentity, flag: country?.flag ?? null, flag_url: country?.flag_url ?? canonicalCountry?.flag_image ?? null, ballots: row.ballots, editions: row.editions.size, rounds: row.rounds.size, avgBallot: row.ballots ? row.totalPoints / row.ballots : 0, avgSupported: row.ballots ? row.supportedEntries / row.ballots : 0, avgRisk: row.ballots ? row.totalRisk / row.ballots : 0, latest: row.latest, juryBallots: row.juryBallots.size, juryPoints: row.juryPoints };
  }).sort((a, b) => (b.ballots + b.juryBallots) - (a.ballots + a.juryBallots) || a.name.localeCompare(b.name));

  const targetAgg = new Map<string, any>();
  const ensureTarget = (key: string) => {
    const current = targetAgg.get(key) ?? { points: 0, scores: 0, maxScores: 0, rounds: new Set<string>(), juryPoints: 0, juryScores: 0, juryMaximums: 0 };
    targetAgg.set(key, current);
    return current;
  };
  for (const entry of entries) {
    const current = ensureTarget(String(entry.target_country_code));
    current.points += Number(entry.points ?? 0);
    current.scores += 1;
    if (Number(entry.points ?? 0) >= 10) current.maxScores += 1;
    const submission = eligibleSubmissionMap.get(entry.submission_id);
    if (submission) current.rounds.add(submission.round_id);
  }
  const juryMaxByBallot = new Map<string, number>();
  for (const vote of juryVotes) {
    const ballotKey = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id ?? "unknown"}`;
    juryMaxByBallot.set(ballotKey, Math.max(juryMaxByBallot.get(ballotKey) ?? 0, Number(vote.points ?? 0)));
  }
  for (const vote of juryVotes) {
    if (!vote.receiving_country_id) continue;
    const country = canonical.hod.countriesById.get(vote.receiving_country_id) as any;
    if (!country) continue;
    const current = ensureTarget(String(country.short_code ?? country.name));
    const ballotKey = `${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id ?? "unknown"}`;
    current.juryPoints += Number(vote.points ?? 0);
    current.juryScores += 1;
    if (Number(vote.points ?? 0) > 0 && Number(vote.points ?? 0) === (juryMaxByBallot.get(ballotKey) ?? 0)) current.juryMaximums += 1;
  }
  const targetRows = [...targetAgg.entries()].map(([entryKey, value]) => {
    const canonicalCountry = canonical.hod.countriesByCode.get(String(entryKey).trim().toUpperCase()) as any;
    const catalog = entryCatalog.get(entryKey) ?? entryCatalog.get(String(entryKey).toUpperCase());
    return { entryKey, name: catalog?.name ?? canonicalCountry?.name ?? entryKey, code: catalog?.code ?? canonicalCountry?.short_code ?? entryKey, image: catalog?.image ?? canonicalCountry?.flag_image ?? null, flag: catalog?.flag ?? null, points: value.points, scores: value.scores, maxScores: value.maxScores, rounds: value.rounds.size, average: value.scores ? value.points / value.scores : 0, juryPoints: value.juryPoints, juryScores: value.juryScores, juryMaximums: value.juryMaximums, combinedRawPoints: value.points + value.juryPoints };
  }).sort((a, b) => (b.points + b.juryPoints) - (a.points + a.juryPoints));

  const televoteTargetTotal = targetRows.reduce((sum, row) => sum + row.points, 0);
  const juryTargetTotal = targetRows.reduce((sum, row) => sum + row.juryPoints, 0);
  const channelComparisonRows = targetRows.map((row) => {
    const televoteShare = televoteTargetTotal ? row.points / televoteTargetTotal : 0;
    const juryShare = juryTargetTotal ? row.juryPoints / juryTargetTotal : 0;
    return { entryKey: row.entryKey, name: row.name, code: row.code, image: row.image, televotePoints: row.points, juryPoints: row.juryPoints, televoteShare: Math.round(televoteShare * 10000) / 100, juryShare: Math.round(juryShare * 10000) / 100, shareDelta: Math.round((televoteShare - juryShare) * 10000) / 100 };
  }).filter((row) => row.televotePoints > 0 || row.juryPoints > 0).sort((a, b) => Math.abs(b.shareDelta) - Math.abs(a.shareDelta));

  const scoreDistribution = new Array<number>(10).fill(0);
  for (const entry of entries) {
    const points = Math.trunc(Number(entry.points ?? 0));
    if (points >= 1 && points <= 10) scoreDistribution[points - 1] += 1;
  }
  const daily = new Map<string, { ballots: number; voters: Set<string> }>();
  for (const submission of eligibleSubmissions) {
    const date = submission.created_at.slice(0, 10);
    const bucket = daily.get(date) ?? { ballots: 0, voters: new Set<string>() };
    bucket.ballots += 1;
    bucket.voters.add(normalizeIdentity(submission.country_code));
    daily.set(date, bucket);
  }
  const dailyActivity = [...daily.entries()].map(([date, value]) => ({ date, ballots: value.ballots, voterCountries: value.voters.size })).sort((a, b) => a.date.localeCompare(b.date));

  const hodAgg = new Map<string, any>();
  const ensureHod = (resolvedHod: NonNullable<ReturnType<typeof canonical.hod.resolve>>) => {
    const current = hodAgg.get(resolvedHod.personId) ?? { personId: resolvedHod.personId, displayName: resolvedHod.displayName, identityKey: resolvedHod.identityKey, countries: new Set<string>(), editions: new Set<string>(), televoteBallots: 0, televotePoints: 0, juryBallots: new Set<string>(), juryVotes: 0, juryPoints: 0 };
    hodAgg.set(resolvedHod.personId, current);
    return current;
  };
  for (const submission of eligibleSubmissions) {
    const resolvedHod = televoteHodBySubmission.get(submission.id);
    if (!resolvedHod) continue;
    const bucket = ensureHod(resolvedHod);
    bucket.countries.add(String(submission.country_code));
    const editionId = roundCanonicalEdition.get(submission.round_id);
    if (editionId) bucket.editions.add(editionId);
    bucket.televoteBallots += 1;
    bucket.televotePoints += (entriesBySubmission.get(submission.id) ?? []).reduce((sum, entry) => sum + Number(entry.points ?? 0), 0);
  }
  for (const vote of juryVotes) {
    if (!vote.voter_country_id) continue;
    const resolvedHod = canonical.hod.resolve(vote.edition_id, vote.voter_country_id, "jury");
    if (!resolvedHod) continue;
    const bucket = ensureHod(resolvedHod);
    const country = canonical.hod.countriesById.get(vote.voter_country_id) as any;
    bucket.countries.add(String(country?.short_code ?? vote.voter_country_id));
    bucket.editions.add(vote.edition_id);
    bucket.juryBallots.add(`${vote.edition_id}:${vote.show_id ?? "edition"}:${vote.voter_country_id}`);
    bucket.juryVotes += 1;
    bucket.juryPoints += Number(vote.points ?? 0);
  }
  const hodRows = [...hodAgg.values()].map((row) => ({ personId: row.personId, displayName: row.displayName, identityKey: row.identityKey, countries: [...row.countries].sort(), editions: row.editions.size, televoteBallots: row.televoteBallots, televotePoints: row.televotePoints, juryBallots: row.juryBallots.size, juryVotes: row.juryVotes, juryPoints: row.juryPoints })).sort((a, b) => (b.televoteBallots + b.juryBallots) - (a.televoteBallots + a.juryBallots));

  const rawTelevoteAssigned = validRawSubmissions.filter((submission) => Boolean(televoteHodBySubmission.get(submission.id))).length;
  const rawJuryAssignedBallots = [...juryRawBallotKeys].filter((key) => Boolean(juryHodByBallotKey.get(key))).length;
  const hod = {
    selectedPersonId: selectedHod?.id ?? null,
    selectedPersonName: selectedHod?.displayName ?? null,
    people: canonical.hod.people,
    assignmentCount: canonical.hod.assignments.length,
    coverage: { televoteAssignedBallots: rawTelevoteAssigned, televoteUnknownBallots: validRawSubmissions.length - rawTelevoteAssigned, juryAssignedBallots: rawJuryAssignedBallots, juryUnknownBallots: juryRawBallotKeys.size - rawJuryAssignedBallots },
  };

  return { scope: { editions: resolved.editions, rounds: resolved.rounds, allEditions: resolved.allEditions, allRounds: resolved.allRounds }, overview, hod, hodRows, editionRows, delegationRows, targetRows, channelComparisonRows, scoreDistribution, dailyActivity };
}
