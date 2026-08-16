import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type MergedAnalysisScope =
  | { mode: "all_editions" }
  | { mode: "edition"; editionId: string }
  | { mode: "edition_range"; fromEditionId: string; toEditionId: string }
  | { mode: "round"; roundId: string };

type EditionRow = { id: string; name: string; created_at: string };
type RoundRow = {
  id: string;
  name: string;
  edition_id: string;
  status: string;
  created_at: string;
};
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
type VoteEntryRow = {
  submission_id: string;
  target_country_code: string;
  points: number;
};

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function validateScope(scope: MergedAnalysisScope): MergedAnalysisScope {
  if (!scope || typeof scope !== "object") throw new Error("Invalid analysis scope");
  switch (scope.mode) {
    case "all_editions":
      return { mode: "all_editions" };
    case "edition":
      if (!scope.editionId) throw new Error("Missing edition");
      return { mode: "edition", editionId: String(scope.editionId) };
    case "edition_range":
      if (!scope.fromEditionId || !scope.toEditionId) throw new Error("Missing edition range");
      return {
        mode: "edition_range",
        fromEditionId: String(scope.fromEditionId),
        toEditionId: String(scope.toEditionId),
      };
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

  if (scope.mode === "all_editions") {
    selectedRounds = allRounds;
  } else if (scope.mode === "round") {
    selectedRounds = allRounds.filter((round) => round.id === scope.roundId);
  } else if (scope.mode === "edition") {
    selectedRounds = allRounds.filter((round) => round.edition_id === scope.editionId);
  } else {
    const fromIndex = editions.findIndex((edition) => edition.id === scope.fromEditionId);
    const toIndex = editions.findIndex((edition) => edition.id === scope.toEditionId);
    if (fromIndex < 0 || toIndex < 0) throw new Error("Edition range could not be resolved");
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const selectedEditionIds = new Set(editions.slice(start, end + 1).map((edition) => edition.id));
    selectedRounds = allRounds.filter((round) => selectedEditionIds.has(round.edition_id));
  }

  const selectedEditionIds = new Set(selectedRounds.map((round) => round.edition_id));
  return {
    editions: editions.filter((edition) => selectedEditionIds.has(edition.id)),
    rounds: selectedRounds,
    allEditions: editions,
    allRounds,
  };
}

export async function getMergedScopedAnalyticsServer(scopeInput: MergedAnalysisScope) {
  await requireMergedTelevotingAdminServer();
  const resolved = await resolveScope(scopeInput);
  const roundIds = resolved.rounds.map((round) => round.id);
  const roundMap = new Map(resolved.rounds.map((round) => [round.id, round]));

  const empty = {
    scope: resolved,
    overview: {
      ballots: 0,
      voterCountries: 0,
      editions: resolved.editions.length,
      rounds: resolved.rounds.length,
      avgBallotPoints: 0,
      avgSupported: 0,
      avgRisk: 0,
      highRisk: 0,
      vpnBallots: 0,
    },
    editionRows: [] as Array<{
      id: string;
      name: string;
      ballots: number;
      voterCountries: number;
      rounds: number;
      points: number;
      avgBallot: number;
    }>,
    delegationRows: [] as Array<{
      identity: string;
      name: string;
      code: string;
      flag: string | null;
      flag_url: string | null;
      ballots: number;
      editions: number;
      rounds: number;
      avgBallot: number;
      avgSupported: number;
      avgRisk: number;
      latest: string;
    }>,
    targetRows: [] as Array<{
      entryKey: string;
      name: string;
      code: string;
      image: string | null;
      flag: string | null;
      points: number;
      scores: number;
      maxScores: number;
      rounds: number;
      average: number;
    }>,
    scoreDistribution: new Array<number>(10).fill(0),
    dailyActivity: [] as Array<{ date: string; ballots: number; voterCountries: number }>,
  };

  if (!roundIds.length) return empty;

  const { data: submissionsRaw, error: submissionError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,round_id,country_code,username,username_normalized,created_at,status,risk_score,ip_country,is_vpn")
    .in("round_id", roundIds)
    .order("created_at", { ascending: true })
    .limit(50000);
  if (submissionError) throw new Error(submissionError.message);

  const submissions = (submissionsRaw ?? []) as SubmissionRow[];
  const eligibleSubmissions = submissions.filter((submission) => submission.status !== "deleted");
  const eligibleSubmissionMap = new Map(eligibleSubmissions.map((submission) => [submission.id, submission]));
  const eligibleIds = [...eligibleSubmissionMap.keys()];

  let entries: VoteEntryRow[] = [];
  if (eligibleIds.length) {
    const { data: entryRows, error: entryError } = await televotingAdmin
      .from("vote_entries")
      .select("submission_id,target_country_code,points")
      .in("submission_id", eligibleIds)
      .limit(250000);
    if (entryError) throw new Error(entryError.message);
    entries = (entryRows ?? []) as VoteEntryRow[];
  }

  const entriesBySubmission = new Map<string, VoteEntryRow[]>();
  for (const entry of entries) {
    const list = entriesBySubmission.get(entry.submission_id) ?? [];
    list.push(entry);
    entriesBySubmission.set(entry.submission_id, list);
  }

  const [countryResult, roundEntryResult] = await Promise.all([
    televotingAdmin.from("countries").select("code,name,flag,flag_url"),
    televotingAdmin
      .from("round_entries")
      .select("entry_key,entry_type,country_code,custom_name,short_name,entry_code,subtitle,image_url")
      .in("round_id", roundIds),
  ]);
  if (countryResult.error) throw new Error(countryResult.error.message);
  if (roundEntryResult.error) throw new Error(roundEntryResult.error.message);

  const countries = countryResult.data ?? [];
  const countryLookup = new Map<string, (typeof countries)[number]>();
  const countryByCode = new Map(countries.map((country) => [country.code, country]));
  for (const country of countries) {
    countryLookup.set(normalizeIdentity(country.code), country);
    countryLookup.set(normalizeIdentity(country.name), country);
  }

  const entryCatalog = new Map<string, {
    name: string;
    code: string;
    image: string | null;
    flag: string | null;
  }>();
  for (const entry of roundEntryResult.data ?? []) {
    const country = entry.country_code ? countryByCode.get(entry.country_code) : undefined;
    entryCatalog.set(entry.entry_key, {
      name: entry.custom_name || entry.short_name || country?.name || entry.entry_key,
      code: entry.entry_code || entry.country_code || entry.entry_key,
      image: entry.image_url || country?.flag_url || null,
      flag: country?.flag || null,
    });
  }

  const voterCountries = new Set(
    eligibleSubmissions.map((submission) => normalizeIdentity(submission.country_code)).filter(Boolean),
  );
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

  const overview = {
    ballots: eligibleSubmissions.length,
    voterCountries: voterCountries.size,
    editions: resolved.editions.length,
    rounds: resolved.rounds.length,
    avgBallotPoints: eligibleSubmissions.length ? totalBallotPoints / eligibleSubmissions.length : 0,
    avgSupported: eligibleSubmissions.length ? totalSupportedEntries / eligibleSubmissions.length : 0,
    avgRisk: eligibleSubmissions.length ? totalRisk / eligibleSubmissions.length : 0,
    highRisk,
    vpnBallots,
  };

  const editionAgg = new Map<string, { ballots: number; voters: Set<string>; rounds: Set<string>; points: number }>();
  for (const edition of resolved.editions) {
    editionAgg.set(edition.id, { ballots: 0, voters: new Set<string>(), rounds: new Set<string>(), points: 0 });
  }
  for (const submission of eligibleSubmissions) {
    const round = roundMap.get(submission.round_id);
    if (!round) continue;
    const bucket = editionAgg.get(round.edition_id);
    if (!bucket) continue;
    bucket.ballots += 1;
    bucket.voters.add(normalizeIdentity(submission.country_code));
    bucket.rounds.add(submission.round_id);
    bucket.points += (entriesBySubmission.get(submission.id) ?? []).reduce(
      (sum, entry) => sum + Number(entry.points ?? 0),
      0,
    );
  }
  const editionRows = resolved.editions
    .map((edition) => {
      const bucket = editionAgg.get(edition.id)!;
      return {
        id: edition.id,
        name: edition.name,
        ballots: bucket.ballots,
        voterCountries: bucket.voters.size,
        rounds: bucket.rounds.size,
        points: bucket.points,
        avgBallot: bucket.ballots ? bucket.points / bucket.ballots : 0,
      };
    })
    .filter((row) => row.ballots > 0);

  const delegationAgg = new Map<string, {
    rawIdentity: string;
    ballots: number;
    editions: Set<string>;
    rounds: Set<string>;
    totalPoints: number;
    supportedEntries: number;
    latest: string;
    totalRisk: number;
  }>();
  for (const submission of eligibleSubmissions) {
    const round = roundMap.get(submission.round_id);
    if (!round) continue;
    const key = normalizeIdentity(submission.country_code) || submission.country_code;
    const current = delegationAgg.get(key) ?? {
      rawIdentity: submission.country_code,
      ballots: 0,
      editions: new Set<string>(),
      rounds: new Set<string>(),
      totalPoints: 0,
      supportedEntries: 0,
      latest: submission.created_at,
      totalRisk: 0,
    };
    const ballotEntries = entriesBySubmission.get(submission.id) ?? [];
    current.ballots += 1;
    current.editions.add(round.edition_id);
    current.rounds.add(submission.round_id);
    current.totalPoints += ballotEntries.reduce((sum, entry) => sum + Number(entry.points ?? 0), 0);
    current.supportedEntries += ballotEntries.filter((entry) => Number(entry.points ?? 0) > 0).length;
    current.totalRisk += Number(submission.risk_score ?? 0);
    if (new Date(submission.created_at).getTime() > new Date(current.latest).getTime()) {
      current.latest = submission.created_at;
    }
    delegationAgg.set(key, current);
  }

  const delegationRows = [...delegationAgg.values()]
    .map((row) => {
      const country = countryLookup.get(normalizeIdentity(row.rawIdentity));
      return {
        identity: row.rawIdentity,
        name: country?.name ?? (row.rawIdentity || "Unresolved voter"),
        code: country?.code ?? row.rawIdentity,
        flag: country?.flag ?? null,
        flag_url: country?.flag_url ?? null,
        ballots: row.ballots,
        editions: row.editions.size,
        rounds: row.rounds.size,
        avgBallot: row.ballots ? row.totalPoints / row.ballots : 0,
        avgSupported: row.ballots ? row.supportedEntries / row.ballots : 0,
        avgRisk: row.ballots ? row.totalRisk / row.ballots : 0,
        latest: row.latest,
      };
    })
    .sort((a, b) => b.ballots - a.ballots || a.name.localeCompare(b.name));

  const targetAgg = new Map<string, { points: number; scores: number; maxScores: number; rounds: Set<string> }>();
  for (const entry of entries) {
    const submission = eligibleSubmissionMap.get(entry.submission_id);
    const current = targetAgg.get(entry.target_country_code) ?? {
      points: 0,
      scores: 0,
      maxScores: 0,
      rounds: new Set<string>(),
    };
    current.points += Number(entry.points ?? 0);
    current.scores += 1;
    if (Number(entry.points ?? 0) >= 10) current.maxScores += 1;
    if (submission) current.rounds.add(submission.round_id);
    targetAgg.set(entry.target_country_code, current);
  }

  const targetRows = [...targetAgg.entries()]
    .map(([entryKey, value]) => ({
      entryKey,
      ...(entryCatalog.get(entryKey) ?? { name: entryKey, code: entryKey, image: null, flag: null }),
      points: value.points,
      scores: value.scores,
      maxScores: value.maxScores,
      rounds: value.rounds.size,
      average: value.scores ? value.points / value.scores : 0,
    }))
    .sort((a, b) => b.points - a.points || b.average - a.average);

  const scoreDistribution = new Array<number>(10).fill(0);
  for (const entry of entries) {
    const points = Number(entry.points ?? 0);
    if (points >= 1 && points <= 10) scoreDistribution[points - 1] += 1;
  }

  const dailyMap = new Map<string, { ballots: number; voterCountries: Set<string> }>();
  for (const submission of eligibleSubmissions) {
    const date = new Date(submission.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const current = dailyMap.get(key) ?? { ballots: 0, voterCountries: new Set<string>() };
    current.ballots += 1;
    current.voterCountries.add(normalizeIdentity(submission.country_code));
    dailyMap.set(key, current);
  }

  const dailyActivity = [...dailyMap.entries()]
    .map(([date, value]) => ({
      date,
      ballots: value.ballots,
      voterCountries: value.voterCountries.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    scope: resolved,
    overview,
    editionRows,
    delegationRows,
    targetRows,
    scoreDistribution,
    dailyActivity,
  };
}
