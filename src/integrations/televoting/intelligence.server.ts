import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type IntelligencePair = {
  votingCountry: string;
  targetCountry: string;
  opportunities: number;
  supported: number;
  supportFrequency: number;
  maximumScores: number;
  maximumFrequency: number;
  points: number;
  averagePoints: number;
  reciprocalSupport: number;
  riskScore: number;
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

const pct = (value: number) => Math.round(value * 1000) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

export async function getMergedIntelligenceServer() {
  await requireMergedTelevotingAdminServer();

  const [submissionResult, roundResult, roundEntryResult, countryResult] = await Promise.all([
    televotingAdmin
      .from("vote_submissions")
      .select("id,round_id,country_code,username,username_normalized,ip_country,is_vpn,risk_score,status,created_at")
      .order("created_at", { ascending: true })
      .limit(50000),
    televotingAdmin.from("rounds").select("id,name,edition_id,status").order("created_at", { ascending: true }),
    televotingAdmin.from("round_entries").select("round_id,entry_key,country_code"),
    televotingAdmin.from("countries").select("code,name"),
  ]);

  if (submissionResult.error) throw new Error(submissionResult.error.message);
  if (roundResult.error) throw new Error(roundResult.error.message);
  if (roundEntryResult.error) throw new Error(roundEntryResult.error.message);
  if (countryResult.error) throw new Error(countryResult.error.message);

  const submissions = (submissionResult.data ?? []) as Submission[];
  const rounds = (roundResult.data ?? []) as Round[];
  const roundEntries = (roundEntryResult.data ?? []) as RoundEntry[];
  const countries = (countryResult.data ?? []) as Country[];
  const countryName = new Map(countries.map((country) => [country.code, country.name]));

  const ids = submissions.map((row) => row.id);
  let entries: Entry[] = [];
  if (ids.length) {
    const { data, error } = await televotingAdmin
      .from("vote_entries")
      .select("submission_id,target_country_code,points")
      .in("submission_id", ids)
      .limit(250000);
    if (error) throw new Error(error.message);
    entries = (data ?? []) as Entry[];
  }

  const entriesBySubmission = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = entriesBySubmission.get(entry.submission_id) ?? [];
    list.push(entry);
    entriesBySubmission.set(entry.submission_id, list);
  }

  const participantsByRound = new Map<string, Set<string>>();
  for (const entry of roundEntries) {
    const target = entry.country_code || entry.entry_key;
    if (!target) continue;
    const set = participantsByRound.get(entry.round_id) ?? new Set<string>();
    set.add(target);
    participantsByRound.set(entry.round_id, set);
  }

  type PairAccumulator = {
    opportunities: number;
    supported: number;
    max: number;
    points: number;
  };
  const pairs = new Map<string, PairAccumulator>();
  const pairKey = (voter: string, target: string) => `${voter}\u0000${target}`;

  for (const submission of submissions) {
    if (submission.status === "deleted") continue;
    const voter = submission.country_code;
    const participants = participantsByRound.get(submission.round_id) ?? new Set<string>();
    const points = new Map((entriesBySubmission.get(submission.id) ?? []).map((entry) => [entry.target_country_code, Number(entry.points || 0)]));
    const maxScore = Math.max(0, ...points.values());

    for (const target of participants) {
      if (!target || target === voter) continue;
      const key = pairKey(voter, target);
      const current = pairs.get(key) ?? { opportunities: 0, supported: 0, max: 0, points: 0 };
      const score = points.get(target) ?? 0;
      current.opportunities += 1;
      current.points += score;
      if (score > 0) current.supported += 1;
      if (score > 0 && score === maxScore) current.max += 1;
      pairs.set(key, current);
    }
  }

  const relationships: IntelligencePair[] = [];
  for (const [key, value] of pairs) {
    const [votingCode, targetCode] = key.split("\u0000");
    const supportFrequency = value.opportunities ? value.supported / value.opportunities : 0;
    const maximumFrequency = value.opportunities ? value.max / value.opportunities : 0;
    const reverse = pairs.get(pairKey(targetCode, votingCode));
    const reverseFrequency = reverse?.opportunities ? reverse.supported / reverse.opportunities : 0;
    const reciprocalSupport = Math.min(supportFrequency, reverseFrequency);

    const confidence = Math.min(1, value.opportunities / 5);
    let risk = confidence * 20;
    const reasons: string[] = [];
    if (value.opportunities >= 5 && supportFrequency >= 0.8) {
      risk += 25;
      reasons.push(`Supported in ${pct(supportFrequency)}% of opportunities`);
    }
    if (value.opportunities >= 5 && maximumFrequency >= 0.6) {
      risk += 25;
      reasons.push(`Maximum score in ${pct(maximumFrequency)}% of opportunities`);
    }
    if (value.opportunities >= 5 && reciprocalSupport >= 0.7) {
      risk += 20;
      reasons.push(`Strong reciprocal support (${pct(reciprocalSupport)}%)`);
    }
    const avg = value.opportunities ? value.points / value.opportunities : 0;
    if (value.opportunities >= 5 && avg >= 5) {
      risk += 10;
      reasons.push(`High average support (${round2(avg)} points)`);
    }

    relationships.push({
      votingCountry: countryName.get(votingCode) ?? votingCode,
      targetCountry: countryName.get(targetCode) ?? targetCode,
      opportunities: value.opportunities,
      supported: value.supported,
      supportFrequency: pct(supportFrequency),
      maximumScores: value.max,
      maximumFrequency: pct(maximumFrequency),
      points: value.points,
      averagePoints: round2(avg),
      reciprocalSupport: pct(reciprocalSupport),
      riskScore: Math.min(100, Math.round(risk)),
      reasons,
    });
  }
  relationships.sort((a, b) => b.riskScore - a.riskScore || b.opportunities - a.opportunities);

  const usernameCounts = new Map<string, Set<string>>();
  const vpnCountries = new Map<string, number>();
  const highRiskCountries = new Map<string, number>();
  const suspiciousCountries = new Map<string, number>();

  for (const submission of submissions) {
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
    countries: [...suspiciousCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(code) ?? code),
  });
  pushSignal({
    key: "high-risk",
    severity: "high",
    title: "High-risk ballots",
    description: "Ballots with stored risk score 65 or higher should receive organizer attention.",
    count: [...highRiskCountries.values()].reduce((a, b) => a + b, 0),
    countries: [...highRiskCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(code) ?? code),
  });
  pushSignal({
    key: "vpn",
    severity: "medium",
    title: "VPN / proxy evidence",
    description: "VPN evidence is supporting technical information only; it does not define delegation identity by itself.",
    count: [...vpnCountries.values()].reduce((a, b) => a + b, 0),
    countries: [...vpnCountries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code]) => countryName.get(code) ?? code),
  });
  pushSignal({
    key: "username-cross-country",
    severity: multiCountryUsernames.length > 4 ? "high" : "medium",
    title: "Usernames seen across multiple countries",
    description: "This is supporting identity evidence. The selected fictional country remains the permanent delegation identity.",
    count: multiCountryUsernames.length,
    countries: [...new Set(multiCountryUsernames.flatMap(([, codes]) => [...codes]))].slice(0, 8).map((code) => countryName.get(code) ?? code),
  });

  const stats = {
    ballots: submissions.length,
    active: submissions.filter((row) => row.status !== "deleted").length,
    deleted: submissions.filter((row) => row.status === "deleted").length,
    suspicious: submissions.filter((row) => row.status === "suspicious").length,
    verified: submissions.filter((row) => row.status === "verified").length,
    highRisk: submissions.filter((row) => Number(row.risk_score ?? 0) >= 65).length,
    vpn: submissions.filter((row) => row.is_vpn).length,
    rounds: rounds.length,
    relationships: relationships.length,
    attentionRelationships: relationships.filter((row) => row.riskScore >= 50).length,
  };

  return { stats, signals, relationships: relationships.slice(0, 500) };
}
