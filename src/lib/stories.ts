import type { JuryVote, ResultRow, Show } from "./data";

export type StoryKind =
  | "closest-battle"
  | "decisive-voter"
  | "jury-darling"
  | "televote-darling"
  | "polarizing"
  | "record";

export type ResultStory = {
  id: string;
  kind: StoryKind;
  priority: number;
  headline: string;
  explanation: string;
  metricLabel: string;
  metricValue: string;
  countryIds: string[];
  href: string;
};

type StoryOptions = {
  show: Show;
  results: ResultRow[];
  jury: JuryVote[];
  labels: Map<string, string>;
  allResults?: ResultRow[];
  allShows?: Show[];
};

function label(labels: Map<string, string>, id: string) {
  return labels.get(id) ?? "An entry";
}

function rankChannel(rows: ResultRow[], key: "jury_points" | "televote_points") {
  return [...rows]
    .sort(
      (a, b) =>
        b[key] - a[key] ||
        (a.final_rank ?? Number.MAX_SAFE_INTEGER) - (b.final_rank ?? Number.MAX_SAFE_INTEGER) ||
        a.country_id.localeCompare(b.country_id),
    )
    .map((row) => ({
      ...row,
      channelRank: 1 + rows.filter((candidate) => candidate[key] > row[key]).length,
    }));
}

function storyHref(showId: string, storyId: string) {
  return `/shows/${showId}?tab=stories&story=${encodeURIComponent(storyId)}`;
}

/** Build reproducible editorial cards from archived result rows only. */
export function buildShowStories(options: StoryOptions): ResultStory[] {
  const rows = options.results
    .filter((row) => row.show_id === options.show.id && row.final_rank != null)
    .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));

  if (rows.length < 2) return [];

  const stories: ResultStory[] = [];
  const closest = rows
    .slice(1)
    .map((row, index) => ({
      a: rows[index],
      b: row,
      gap: Math.abs(rows[index].total_points - row.total_points),
    }))
    .sort((a, b) => a.gap - b.gap)[0];

  if (closest) {
    const id = "closest-battle";
    stories.push({
      id,
      kind: id,
      priority: closest.gap <= 3 ? 95 : 75,
      headline: `${label(options.labels, closest.a.country_id)} and ${label(options.labels, closest.b.country_id)} were separated by ${closest.gap} point${closest.gap === 1 ? "" : "s"}`,
      explanation: `The smallest final-score gap was between places #${closest.a.final_rank} and #${closest.b.final_rank}.`,
      metricLabel: "Closest gap",
      metricValue: `${closest.gap} pt${closest.gap === 1 ? "" : "s"}`,
      countryIds: [closest.a.country_id, closest.b.country_id],
      href: storyHref(options.show.id, id),
    });
  }

  const winner = rows[0];
  const runnerUp = rows[1];
  const winningMargin = winner.total_points - runnerUp.total_points;
  const ballots = new Map<string, JuryVote[]>();
  options.jury
    .filter((vote) => vote.show_id === options.show.id)
    .forEach((vote) => {
      ballots.set(vote.voter_country_id, [...(ballots.get(vote.voter_country_id) ?? []), vote]);
    });

  const decisive =
    winningMargin > 0
      ? [...ballots.entries()]
          .map(([voterId, votes]) => {
            const winnerPoints =
              votes.find((vote) => vote.receiving_country_id === winner.country_id)?.points ?? 0;
            const runnerUpPoints =
              votes.find((vote) => vote.receiving_country_id === runnerUp.country_id)?.points ?? 0;
            return { voterId, swing: winnerPoints - runnerUpPoints };
          })
          .filter((ballot) => ballot.swing >= winningMargin && ballot.swing > 0)
          .sort((a, b) => b.swing - a.swing)[0]
      : null;

  if (decisive) {
    const id = "decisive-voter";
    stories.push({
      id,
      kind: id,
      priority: 100,
      headline: `${label(options.labels, decisive.voterId)} delivered a winner-sized ballot swing`,
      explanation: `Its ballot favored ${label(options.labels, winner.country_id)} over ${label(options.labels, runnerUp.country_id)} by ${decisive.swing} points, covering the ${winningMargin}-point winning margin.`,
      metricLabel: "Ballot swing",
      metricValue: `${decisive.swing} pts`,
      countryIds: [decisive.voterId, winner.country_id, runnerUp.country_id],
      href: storyHref(options.show.id, id),
    });
  }

  const juryRanks = rankChannel(rows, "jury_points");
  const televoteRanks = rankChannel(rows, "televote_points");
  const juryWinner = juryRanks[0];
  const televoteWinner = televoteRanks[0];
  const juryLeaderCount = juryWinner
    ? juryRanks.filter((row) => row.jury_points === juryWinner.jury_points).length
    : 0;
  const televoteLeaderCount = televoteWinner
    ? televoteRanks.filter((row) => row.televote_points === televoteWinner.televote_points).length
    : 0;

  if (juryWinner) {
    const id = "jury-darling";
    stories.push({
      id,
      kind: id,
      priority: juryWinner.country_id === winner.country_id ? 65 : 85,
      headline:
        juryLeaderCount > 1
          ? `${label(options.labels, juryWinner.country_id)} shared the highest jury score`
          : `${label(options.labels, juryWinner.country_id)} topped the juries`,
      explanation:
        juryLeaderCount > 1
          ? `${juryLeaderCount} entries tied on ${juryWinner.jury_points} jury points.`
          : juryWinner.country_id === winner.country_id
            ? "The overall winner also led the jury scoreboard."
            : `The jury winner finished #${juryWinner.final_rank} overall.`,
      metricLabel: "Jury points",
      metricValue: `${juryWinner.jury_points}`,
      countryIds: [juryWinner.country_id],
      href: storyHref(options.show.id, id),
    });
  }

  if (televoteWinner) {
    const id = "televote-darling";
    stories.push({
      id,
      kind: id,
      priority: televoteWinner.country_id === winner.country_id ? 65 : 85,
      headline:
        televoteLeaderCount > 1
          ? `${label(options.labels, televoteWinner.country_id)} shared the highest televote score`
          : `${label(options.labels, televoteWinner.country_id)} won the televote`,
      explanation:
        televoteLeaderCount > 1
          ? `${televoteLeaderCount} entries tied on ${televoteWinner.televote_points} televote points.`
          : televoteWinner.country_id === winner.country_id
            ? "The overall winner also received the highest public score."
            : `The televote winner finished #${televoteWinner.final_rank} overall.`,
      metricLabel: "Televote points",
      metricValue: `${televoteWinner.televote_points}`,
      countryIds: [televoteWinner.country_id],
      href: storyHref(options.show.id, id),
    });
  }

  const juryRankMap = new Map(juryRanks.map((row) => [row.country_id, row.channelRank]));
  const teleRankMap = new Map(televoteRanks.map((row) => [row.country_id, row.channelRank]));
  const polarizing = rows
    .map((row) => ({
      row,
      juryRank: juryRankMap.get(row.country_id) ?? 0,
      teleRank: teleRankMap.get(row.country_id) ?? 0,
      gap: Math.abs(
        (juryRankMap.get(row.country_id) ?? 0) - (teleRankMap.get(row.country_id) ?? 0),
      ),
    }))
    .sort((a, b) => b.gap - a.gap)[0];

  if (polarizing && polarizing.gap > 0) {
    const id = "polarizing";
    stories.push({
      id,
      kind: id,
      priority: 80,
      headline: `${label(options.labels, polarizing.row.country_id)} split jury and televote opinion most`,
      explanation: `It ranked #${polarizing.juryRank} with juries and #${polarizing.teleRank} with the televote.`,
      metricLabel: "Rank difference",
      metricValue: `${polarizing.gap} places`,
      countryIds: [polarizing.row.country_id],
      href: storyHref(options.show.id, id),
    });
  }

  const showById = new Map((options.allShows ?? []).map((show) => [show.id, show]));
  const previousBest = (options.allResults ?? [])
    .filter(
      (row) =>
        row.show_id !== options.show.id &&
        showById.get(row.show_id ?? "")?.kind === options.show.kind,
    )
    .reduce((maximum, row) => Math.max(maximum, row.total_points), 0);

  if (previousBest > 0 && winner.total_points > previousBest) {
    const id = "record";
    stories.push({
      id,
      kind: id,
      priority: 98,
      headline: `${label(options.labels, winner.country_id)} set a new ${options.show.kind.replace("-", " ")} points record`,
      explanation: `The winning score passed the previous record by ${winner.total_points - previousBest} points.`,
      metricLabel: "New record",
      metricValue: `${winner.total_points} pts`,
      countryIds: [winner.country_id],
      href: storyHref(options.show.id, id),
    });
  }

  return stories.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
