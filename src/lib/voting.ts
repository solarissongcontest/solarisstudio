/**
 * Voting System Builder.
 * Each show owns a VotingConfig: which panels vote, what point scale they use,
 * how the two halves are weighted, tie-break rules and qualifier counts.
 */

export type VotingConfig = {
  juryEnabled: boolean;
  televoteEnabled: boolean;
  /** Ordered high → low. Each juror country hands out exactly these values. */
  juryPoints: number[];
  /** Televote can either mirror the jury scale (per voting country) or be a free total. */
  televoteMode: "scale" | "total";
  televotePoints: number[];
  weighting: { jury: number; televote: number };
  /** When false (default) the weighting above is display-only and totals are a plain sum. */
  weightedScoring: boolean;
  tieBreak: TieBreak[];
  qualifiers: number | null;
  /** Country ids in the order juries are called. Empty = running order. */
  votingOrder: string[];
  allowSelfVote: boolean;
};

export type TieBreak = "televote" | "jury" | "twelves" | "countback" | "runningOrder";

export const POINT_PRESETS: { label: string; points: number[] }[] = [
  { label: "Classic 1-8, 10, 12", points: [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] },
  { label: "Top 5 (12-8)", points: [12, 10, 8, 6, 4] },
  { label: "Top 3 (5/3/1)", points: [5, 3, 1] },
  { label: "Big numbers (100/80/60…)", points: [100, 80, 60, 50, 40, 30, 20, 10] },
  { label: "Linear 10 → 1", points: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
];

export const DEFAULT_VOTING: VotingConfig = {
  juryEnabled: true,
  televoteEnabled: true,
  juryPoints: [12, 10, 8, 7, 6, 5, 4, 3, 2, 1],
  televoteMode: "scale",
  televotePoints: [12, 10, 8, 7, 6, 5, 4, 3, 2, 1],
  weighting: { jury: 50, televote: 50 },
  weightedScoring: false,
  tieBreak: ["televote", "twelves", "jury"],
  qualifiers: null,
  votingOrder: [],
  allowSelfVote: false,
};

export function resolveVoting(raw: unknown): VotingConfig {
  const v = (raw ?? {}) as Partial<VotingConfig>;
  return {
    ...DEFAULT_VOTING,
    ...v,
    juryPoints: v.juryPoints?.length ? v.juryPoints : DEFAULT_VOTING.juryPoints,
    televotePoints: v.televotePoints?.length ? v.televotePoints : DEFAULT_VOTING.televotePoints,
    weighting: { ...DEFAULT_VOTING.weighting, ...(v.weighting ?? {}) },
    weightedScoring: v.weightedScoring ?? DEFAULT_VOTING.weightedScoring,
    tieBreak: v.tieBreak?.length ? v.tieBreak : DEFAULT_VOTING.tieBreak,
    votingOrder: v.votingOrder ?? [],
  };
}

export function parsePointList(input: string): number[] {
  return input
    .split(/[\s,]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}

export const topPoint = (cfg: VotingConfig) => cfg.juryPoints[0] ?? 12;

/* ---------------- top-score resolution ---------------- */

/**
 * Fallback used when a vote's show (and therefore its point scale) is unknown.
 * Matches the historical classic scale so legacy data keeps its 12-point meaning.
 */
export const DEFAULT_TOP_SCORE = 12;

/** Resolves the highest awardable jury score for a given show. */
export type TopScoreResolver = (showId: string | null | undefined) => number;

export function makeTopScoreResolver(
  shows?: { id: string; voting_config: Record<string, unknown> | null }[],
): TopScoreResolver {
  const byShow = new Map<string, number>();
  (shows ?? []).forEach((s) => byShow.set(s.id, topPoint(resolveVoting(s.voting_config))));
  return (showId) => (showId ? (byShow.get(showId) ?? DEFAULT_TOP_SCORE) : DEFAULT_TOP_SCORE);
}

/** True when a vote awarded the maximum points available in its own show. */
export function isTopScore(
  vote: { show_id?: string | null; points: number },
  resolve: TopScoreResolver = () => DEFAULT_TOP_SCORE,
): boolean {
  return vote.points === resolve(vote.show_id ?? null);
}
