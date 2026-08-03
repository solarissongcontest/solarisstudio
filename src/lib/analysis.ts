import type { Country, JuryVote, ResultRow, Show, Televote } from "./data";
import { DEFAULT_TOP_SCORE, isTopScore, makeTopScoreResolver, type TopScoreResolver, type VotingConfig } from "./voting";


export type Standing = {
  countryId: string;
  jury: number;
  televote: number;
  total: number;
  rank: number;
  topPoints: number;
};

/**
 * Compute standings for one show from raw votes, honouring the show's
 * voting configuration (weighting + tie-break chain).
 */
export function computeStandings(
  countryIds: string[],
  jury: JuryVote[],
  tele: Televote[],
  cfg?: VotingConfig,
  runningOrder?: Map<string, number>,
): Standing[] {
  const j = new Map<string, number>();
  const t = new Map<string, number>();
  const twelves = new Map<string, number>();
  countryIds.forEach((id) => {
    j.set(id, 0);
    t.set(id, 0);
    twelves.set(id, 0);
  });
  const top = cfg?.juryPoints?.[0] ?? 12;
  jury.forEach((v) => {
    j.set(v.receiving_country_id, (j.get(v.receiving_country_id) ?? 0) + v.points);
    if (v.points === top)
      twelves.set(v.receiving_country_id, (twelves.get(v.receiving_country_id) ?? 0) + 1);
  });
  tele.forEach((v) => t.set(v.country_id, (t.get(v.country_id) ?? 0) + v.points));

  const wj = (cfg?.weighting.jury ?? 50) / 50;
  const wt = (cfg?.weighting.televote ?? 50) / 50;
  // Weighting percentages are presentation-only unless the show explicitly opts
  // into weighted scoring — by default totals are always a plain sum of the two.
  const applyWeighting = cfg?.weightedScoring === true;

  const rows: Standing[] = countryIds.map((id) => {
    const jp = j.get(id) ?? 0;
    const tp = t.get(id) ?? 0;
    return {
      countryId: id,
      jury: jp,
      televote: tp,
      total: applyWeighting ? Math.round(jp * wj + tp * wt) : jp + tp,
      rank: 0,
      topPoints: twelves.get(id) ?? 0,
    };
  });

  const chain = cfg?.tieBreak ?? ["televote", "twelves", "jury"];
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    for (const rule of chain) {
      if (rule === "televote" && b.televote !== a.televote) return b.televote - a.televote;
      if (rule === "jury" && b.jury !== a.jury) return b.jury - a.jury;
      if (rule === "twelves" && b.topPoints !== a.topPoints) return b.topPoints - a.topPoints;
      if (rule === "countback" && b.topPoints !== a.topPoints) return b.topPoints - a.topPoints;
      if (rule === "runningOrder" && runningOrder) {
        const ra = runningOrder.get(a.countryId) ?? 999;
        const rb = runningOrder.get(b.countryId) ?? 999;
        if (ra !== rb) return rb - ra;
      }
    }
    return 0;
  });
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}


/* ---------------- voting relationship analysis ---------------- */

export type Pair = {
  from: string;
  to: string;
  points: number;
  /** Number of times the maximum score of the vote's own show was awarded. */
  topScoreCount: number;
  count: number;
};

export function pairMatrix(votes: JuryVote[], resolveTopScore?: TopScoreResolver): Map<string, Pair> {
  const resolve = resolveTopScore ?? (() => DEFAULT_TOP_SCORE);
  const m = new Map<string, Pair>();
  votes.forEach((v) => {
    const key = `${v.voter_country_id}>${v.receiving_country_id}`;
    const cur = m.get(key) ?? {
      from: v.voter_country_id,
      to: v.receiving_country_id,
      points: 0,
      topScoreCount: 0,
      count: 0,
    };
    cur.points += v.points;
    cur.count += 1;
    if (isTopScore(v, resolve)) cur.topScoreCount += 1;
    m.set(key, cur);
  });
  return m;
}


export function topSupporters(votes: JuryVote[], countryId: string, limit = 5) {
  const m = new Map<string, number>();
  votes
    .filter((v) => v.receiving_country_id === countryId)
    .forEach((v) => m.set(v.voter_country_id, (m.get(v.voter_country_id) ?? 0) + v.points));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function topRecipients(votes: JuryVote[], countryId: string, limit = 5) {
  const m = new Map<string, number>();
  votes
    .filter((v) => v.voter_country_id === countryId)
    .forEach((v) => m.set(v.receiving_country_id, (m.get(v.receiving_country_id) ?? 0) + v.points));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** Cosine similarity of two countries' outgoing voting vectors. */
export function votingSimilarity(votes: JuryVote[], countries: Country[]) {
  const vectors = new Map<string, Map<string, number>>();
  countries.forEach((c) => vectors.set(c.id, new Map()));
  votes.forEach((v) => {
    const vec = vectors.get(v.voter_country_id);
    if (vec) vec.set(v.receiving_country_id, (vec.get(v.receiving_country_id) ?? 0) + v.points);
  });
  const out: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < countries.length; i++) {
    for (let k = i + 1; k < countries.length; k++) {
      const A = vectors.get(countries[i].id)!;
      const B = vectors.get(countries[k].id)!;
      const keys = new Set([...A.keys(), ...B.keys()]);
      let dot = 0;
      let na = 0;
      let nb = 0;
      keys.forEach((key) => {
        const a = A.get(key) ?? 0;
        const b = B.get(key) ?? 0;
        dot += a * b;
        na += a * a;
        nb += b * b;
      });
      const score = na && nb ? dot / Math.sqrt(na * nb) : 0;
      out.push({ a: countries[i].id, b: countries[k].id, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Mutual support (friendship) and one-sided relationships. */
export function relationships(votes: JuryVote[], resolveTopScore?: TopScoreResolver) {
  const m = pairMatrix(votes, resolveTopScore);

  const seen = new Set<string>();
  const friendships: { a: string; b: string; ab: number; ba: number; total: number }[] = [];
  const oneSided: { a: string; b: string; ab: number; ba: number; gap: number }[] = [];
  m.forEach((pair) => {
    const key = [pair.from, pair.to].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const ab = pair.points;
    const ba = m.get(`${pair.to}>${pair.from}`)?.points ?? 0;
    friendships.push({ a: pair.from, b: pair.to, ab, ba, total: ab + ba });
    const gap = ab - ba;
    if (Math.abs(gap) >= 8)
      oneSided.push(
        gap > 0 ? { a: pair.from, b: pair.to, ab, ba, gap } : { a: pair.to, b: pair.from, ab: ba, ba: ab, gap: -gap },
      );
  });
  return {
    friendships: friendships
      .filter((f) => Math.min(f.ab, f.ba) > 0)
      .sort((x, y) => y.total - x.total),
    oneSided: oneSided.sort((x, y) => y.gap - x.gap),
  };
}

/** Cluster countries greedily by voting similarity. */
export function votingClusters(votes: JuryVote[], countries: Country[], threshold = 0.6) {
  const sims = votingSimilarity(votes, countries);
  const parent = new Map(countries.map((c) => [c.id, c.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  sims
    .filter((s) => s.score >= threshold)
    .forEach((s) => {
      const ra = find(s.a);
      const rb = find(s.b);
      if (ra !== rb) parent.set(ra, rb);
    });
  const groups = new Map<string, string[]>();
  countries.forEach((c) => {
    const root = find(c.id);
    groups.set(root, [...(groups.get(root) ?? []), c.id]);
  });
  return [...groups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
}

/** Regional bias: share of points a country gives inside its own region. */
export function regionalBias(votes: JuryVote[], countries: Country[]) {
  const region = new Map(countries.map((c) => [c.id, c.region]));
  const given = new Map<string, { inRegion: number; total: number }>();
  votes.forEach((v) => {
    const cur = given.get(v.voter_country_id) ?? { inRegion: 0, total: 0 };
    cur.total += v.points;
    if (region.get(v.voter_country_id) === region.get(v.receiving_country_id))
      cur.inRegion += v.points;
    given.set(v.voter_country_id, cur);
  });
  return [...given.entries()]
    .map(([id, v]) => ({ id, share: v.total ? v.inRegion / v.total : 0, ...v }))
    .sort((a, b) => b.share - a.share);
}

/* ---------------- country profile + records ---------------- */

export type CountryProfile = {
  participations: number;
  wins: number;
  best: number | null;
  worst: number | null;
  average: number | null;
  pointsReceived: number;
  pointsGiven: number;
  twelvesReceived: number;
  twelvesGiven: number;
  history: { year: number; rank: number | null; total: number }[];
};

export function countryProfile(
  countryId: string,
  results: ResultRow[],
  jury: JuryVote[],
  editionYear: Map<string, number | null>,
): CountryProfile {
  const mine = results.filter((r) => r.country_id === countryId);
  const ranks = mine.map((r) => r.final_rank).filter((r): r is number => r != null);
  return {
    participations: mine.length,
    wins: ranks.filter((r) => r === 1).length,
    best: ranks.length ? Math.min(...ranks) : null,
    worst: ranks.length ? Math.max(...ranks) : null,
    average: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
    pointsReceived: mine.reduce((a, r) => a + r.total_points, 0),
    pointsGiven: jury.filter((v) => v.voter_country_id === countryId).reduce((a, v) => a + v.points, 0),
    twelvesReceived: jury.filter((v) => v.receiving_country_id === countryId && v.points === 12).length,
    twelvesGiven: jury.filter((v) => v.voter_country_id === countryId && v.points === 12).length,
    history: mine
      .map((r) => ({
        year: editionYear.get(r.edition_id) ?? 0,
        rank: r.final_rank,
        total: r.total_points,
      }))
      .sort((a, b) => a.year - b.year),
  };
}

export type RecordEntry = { label: string; value: string; detail: string };

export function computeRecords(
  results: ResultRow[],
  jury: JuryVote[],
  countries: Country[],
  editionYear: Map<string, number | null>,
): RecordEntry[] {
  const name = new Map(countries.map((c) => [c.id, c.name]));
  const label = (r: ResultRow) => `${name.get(r.country_id) ?? "?"} · ${editionYear.get(r.edition_id) ?? ""}`;
  if (!results.length) return [];

  const sorted = [...results].sort((a, b) => b.total_points - a.total_points);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const winners = results.filter((r) => r.final_rank === 1);
  const lowestWin = [...winners].sort((a, b) => a.total_points - b.total_points)[0];

  const byEdition = new Map<string, ResultRow[]>();
  results.forEach((r) => byEdition.set(r.edition_id, [...(byEdition.get(r.edition_id) ?? []), r]));
  let biggestMargin = { margin: -1, text: "—" };
  let closest = { margin: Number.MAX_SAFE_INTEGER, text: "—" };
  byEdition.forEach((rows, edId) => {
    const s = [...rows].sort((a, b) => b.total_points - a.total_points);
    if (s.length < 2) return;
    const margin = s[0].total_points - s[1].total_points;
    const text = `${name.get(s[0].country_id)} over ${name.get(s[1].country_id)} · ${editionYear.get(edId)}`;
    if (margin > biggestMargin.margin) biggestMargin = { margin, text };
    if (margin < closest.margin) closest = { margin, text };
  });

  const twelveIn = new Map<string, number>();
  const twelveOut = new Map<string, number>();
  jury
    .filter((v) => v.points === 12)
    .forEach((v) => {
      twelveIn.set(v.receiving_country_id, (twelveIn.get(v.receiving_country_id) ?? 0) + 1);
      twelveOut.set(v.voter_country_id, (twelveOut.get(v.voter_country_id) ?? 0) + 1);
    });
  const top = (m: Map<string, number>) => {
    const e = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return e ? { name: name.get(e[0]) ?? "?", n: e[1] } : { name: "—", n: 0 };
  };

  const climb = [...results].sort(
    (a, b) => b.televote_points - b.jury_points - (a.televote_points - a.jury_points),
  )[0];
  const drop = [...results].sort(
    (a, b) => b.jury_points - b.televote_points - (a.jury_points - a.televote_points),
  )[0];

  const winsBy = new Map<string, number>();
  winners.forEach((w) => winsBy.set(w.country_id, (winsBy.get(w.country_id) ?? 0) + 1));
  const mostSuccessful = top(winsBy);

  const rankSpread = new Map<string, number[]>();
  results.forEach((r) => {
    if (r.final_rank != null)
      rankSpread.set(r.country_id, [...(rankSpread.get(r.country_id) ?? []), r.final_rank]);
  });
  let consistent = { name: "—", spread: Number.MAX_SAFE_INTEGER };
  rankSpread.forEach((ranks, id) => {
    if (ranks.length < 2) return;
    const spread = Math.max(...ranks) - Math.min(...ranks);
    if (spread < consistent.spread) consistent = { name: name.get(id) ?? "?", spread };
  });

  return [
    { label: "Highest score ever", value: `${highest.total_points}`, detail: label(highest) },
    { label: "Lowest score ever", value: `${lowest.total_points}`, detail: label(lowest) },
    {
      label: "Lowest winning score",
      value: lowestWin ? `${lowestWin.total_points}` : "—",
      detail: lowestWin ? label(lowestWin) : "No completed edition yet",
    },
    { label: "Largest winning margin", value: `${Math.max(biggestMargin.margin, 0)}`, detail: biggestMargin.text },
    {
      label: "Closest final",
      value: closest.margin === Number.MAX_SAFE_INTEGER ? "—" : `${closest.margin}`,
      detail: closest.text,
    },
    { label: "Most 12 points received", value: `${top(twelveIn).n}`, detail: top(twelveIn).name },
    { label: "Most 12 points given", value: `${top(twelveOut).n}`, detail: top(twelveOut).name },
    {
      label: "Biggest televote climb",
      value: climb ? `+${climb.televote_points - climb.jury_points}` : "—",
      detail: climb ? label(climb) : "—",
    },
    {
      label: "Biggest jury drop",
      value: drop ? `-${drop.jury_points - drop.televote_points}` : "—",
      detail: drop ? label(drop) : "—",
    },
    { label: "Most successful country", value: `${mostSuccessful.n} win(s)`, detail: mostSuccessful.name },
    {
      label: "Most consistent country",
      value: consistent.spread === Number.MAX_SAFE_INTEGER ? "—" : `±${consistent.spread}`,
      detail: consistent.name,
    },
  ];
}
