import { televotingAdmin } from "@/integrations/televoting/client.server";

export type HistoricalTelevoteScore = {
  targetCode: string;
  score: number;
  rank: number;
};

export type HistoricalTelevoteBallot = {
  sourceKey: string;
  editionId: string;
  editionNumber: number | null;
  roundKey: string;
  roundName: string;
  voterCountryCode: string;
  maxScore: number;
  participantCount: number;
  scores: HistoricalTelevoteScore[];
};

type HistoricalRow = {
  source_key: string;
  solaris_edition_id: string;
  edition_number: number | null;
  round_key: string;
  round_name: string;
  voter_country_code: string;
  target_country_code: string;
  score: number;
};

function rankScores(rows: Array<{ targetCode: string; score: number }>) {
  const sortedScores = [...new Set(rows.map((row) => row.score))].sort((a, b) => b - a);
  const rankByScore = new Map<number, number>();
  let position = 1;
  for (const score of sortedScores) {
    rankByScore.set(score, position);
    position += rows.filter((row) => row.score === score).length;
  }
  return rankByScore;
}

/**
 * Loads exact historical country-level voting observations. Unlike modern
 * public ballots, these rows may use legacy scales and may intentionally omit
 * individual voter-target opportunities. Missing rows therefore remain
 * missing instead of being silently converted to zero support.
 */
export async function loadHistoricalTelevoteBallotsServer() {
  const { data, error } = await televotingAdmin
    .from("historical_vote_observations")
    .select(
      "source_key,solaris_edition_id,edition_number,round_key,round_name,voter_country_code,target_country_code,score",
    )
    .order("edition_number", { ascending: true })
    .order("source_key", { ascending: true })
    .order("voter_country_code", { ascending: true })
    .order("target_country_code", { ascending: true })
    .limit(250000);
  if (error) throw new Error(error.message);

  const grouped = new Map<string, HistoricalRow[]>();
  for (const raw of (data ?? []) as HistoricalRow[]) {
    const voter = String(raw.voter_country_code ?? "").trim().toUpperCase();
    const target = String(raw.target_country_code ?? "").trim().toUpperCase();
    if (!voter || !target || voter === target) continue;
    const row = { ...raw, voter_country_code: voter, target_country_code: target };
    const key = `${row.source_key}\u0000${row.solaris_edition_id}\u0000${row.round_key}\u0000${voter}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const ballots: HistoricalTelevoteBallot[] = [];
  for (const rows of grouped.values()) {
    const first = rows[0];
    if (!first) continue;
    const values = rows.map((row) => ({
      targetCode: row.target_country_code,
      score: Number(row.score ?? 0),
    }));
    const rankByScore = rankScores(values);
    ballots.push({
      sourceKey: first.source_key,
      editionId: String(first.solaris_edition_id),
      editionNumber: first.edition_number == null ? null : Number(first.edition_number),
      roundKey: first.round_key,
      roundName: first.round_name,
      voterCountryCode: first.voter_country_code,
      maxScore: Math.max(0, ...values.map((row) => row.score)),
      participantCount: values.length,
      scores: values.map((row) => ({
        ...row,
        rank: rankByScore.get(row.score) ?? values.length,
      })),
    });
  }

  return ballots;
}
