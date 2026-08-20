import { editionLabel, type Country, type Edition, type JuryVote, type Participant, type ResultRow, type Show } from "./data";
import { canonicalEntryFor } from "./entry-utils";

export type DiscoveryStory = {
  id: string;
  eyebrow: string;
  title: string;
  value: string;
  description: string;
  countryId?: string;
  secondCountryId?: string;
  editionId?: string;
  editionLabel?: string;
  artist?: string | null;
  song?: string | null;
};

type Input = {
  countries: Country[];
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
};

type RankedRow = {
  result: ResultRow;
  juryRank: number;
  teleRank: number;
  finalRank: number;
};

function competitionRanks(rows: ResultRow[], key: "jury_points" | "televote_points" | "total_points") {
  const sorted = [...rows].sort((a, b) => b[key] - a[key] || a.country_id.localeCompare(b.country_id));
  const map = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  sorted.forEach((row, index) => {
    if (previous == null || row[key] !== previous) rank = index + 1;
    previous = row[key];
    map.set(row.country_id, rank);
  });
  return map;
}

function contextFor(
  countryId: string,
  editionId: string,
  editions: Edition[],
  participants: Participant[],
) {
  const edition = editions.find((item) => item.id === editionId);
  const entry = canonicalEntryFor(participants, editionId, countryId);
  return {
    editionId,
    editionLabel: edition ? editionLabel(edition) : "Edition",
    artist: entry?.artist ?? null,
    song: entry?.song ?? null,
  };
}

function countryName(id: string, countries: Country[]) {
  return countries.find((country) => country.id === id)?.name ?? "Unknown country";
}

export function buildFanDiscovery(input: Input): DiscoveryStory[] {
  const { countries, editions, shows, participants, results, jury } = input;
  const byShow = new Map<string, ResultRow[]>();

  for (const row of results) {
    if (!row.show_id) continue;
    const list = byShow.get(row.show_id) ?? [];
    list.push(row);
    byShow.set(row.show_id, list);
  }

  const ranked: RankedRow[] = [];
  const margins: Array<{ showId: string; editionId: string; margin: number; winner: ResultRow }> = [];

  for (const [showId, rows] of byShow) {
    if (rows.length < 2) continue;
    const juryRanks = competitionRanks(rows, "jury_points");
    const teleRanks = competitionRanks(rows, "televote_points");
    const totalRanks = competitionRanks(rows, "total_points");
    for (const result of rows) {
      ranked.push({
        result,
        juryRank: juryRanks.get(result.country_id) ?? rows.length,
        teleRank: teleRanks.get(result.country_id) ?? rows.length,
        finalRank: result.final_rank ?? totalRanks.get(result.country_id) ?? rows.length,
      });
    }
    const sorted = [...rows].sort((a, b) => b.total_points - a.total_points);
    if (sorted[0] && sorted[1]) {
      margins.push({
        showId,
        editionId: sorted[0].edition_id,
        margin: sorted[0].total_points - sorted[1].total_points,
        winner: sorted[0],
      });
    }
  }

  const stories: DiscoveryStory[] = [];
  const pushMovement = (
    id: string,
    eyebrow: string,
    title: string,
    row: RankedRow | undefined,
    movement: number,
    description: (name: string, row: RankedRow) => string,
  ) => {
    if (!row || movement <= 0) return;
    const name = countryName(row.result.country_id, countries);
    stories.push({
      id,
      eyebrow,
      title,
      value: `${movement} place${movement === 1 ? "" : "s"}`,
      description: description(name, row),
      countryId: row.result.country_id,
      ...contextFor(row.result.country_id, row.result.edition_id, editions, participants),
    });
  };

  const rescue = [...ranked].sort(
    (a, b) => (b.juryRank - b.finalRank) - (a.juryRank - a.finalRank),
  )[0];
  pushMovement(
    "televote-rescue",
    "The public changed everything",
    "Biggest televote rescue",
    rescue,
    rescue ? rescue.juryRank - rescue.finalRank : 0,
    (name, row) => `${name} moved from #${row.juryRank} after the jury vote to #${row.finalRank} overall.`,
  );

  const collapse = [...ranked].sort(
    (a, b) => (b.finalRank - b.juryRank) - (a.finalRank - a.juryRank),
  )[0];
  pushMovement(
    "jury-collapse",
    "A lead that did not survive",
    "Biggest post-jury collapse",
    collapse,
    collapse ? collapse.finalRank - collapse.juryRank : 0,
    (name, row) => `${name} was #${row.juryRank} with juries but finished #${row.finalRank} after the televote joined in.`,
  );

  const polarising = [...ranked].sort(
    (a, b) => Math.abs(b.juryRank - b.teleRank) - Math.abs(a.juryRank - a.teleRank),
  )[0];
  if (polarising && Math.abs(polarising.juryRank - polarising.teleRank) > 0) {
    const gap = Math.abs(polarising.juryRank - polarising.teleRank);
    const name = countryName(polarising.result.country_id, countries);
    stories.push({
      id: "polarising",
      eyebrow: "Jury and public saw different songs",
      title: "Most polarising entry",
      value: `${gap}-place gap`,
      description: `${name} ranked #${polarising.juryRank} with juries and #${polarising.teleRank} with the televote.`,
      countryId: polarising.result.country_id,
      ...contextFor(polarising.result.country_id, polarising.result.edition_id, editions, participants),
    });
  }

  const juryDarling = [...ranked].sort(
    (a, b) => (b.teleRank - b.juryRank) - (a.teleRank - a.juryRank),
  )[0];
  if (juryDarling && juryDarling.teleRank > juryDarling.juryRank) {
    const name = countryName(juryDarling.result.country_id, countries);
    stories.push({
      id: "jury-darling",
      eyebrow: "The juries were much more convinced",
      title: "Jury darling",
      value: `Jury #${juryDarling.juryRank}`,
      description: `${name} ranked ${juryDarling.teleRank - juryDarling.juryRank} places higher with juries than with the televote.`,
      countryId: juryDarling.result.country_id,
      ...contextFor(juryDarling.result.country_id, juryDarling.result.edition_id, editions, participants),
    });
  }

  const teleFavourite = [...ranked].sort(
    (a, b) => (b.juryRank - b.teleRank) - (a.juryRank - a.teleRank),
  )[0];
  if (teleFavourite && teleFavourite.juryRank > teleFavourite.teleRank) {
    const name = countryName(teleFavourite.result.country_id, countries);
    stories.push({
      id: "tele-favourite",
      eyebrow: "The public heard something the juries did not",
      title: "Televote favourite",
      value: `Tele #${teleFavourite.teleRank}`,
      description: `${name} ranked ${teleFavourite.juryRank - teleFavourite.teleRank} places higher with the televote than with juries.`,
      countryId: teleFavourite.result.country_id,
      ...contextFor(teleFavourite.result.country_id, teleFavourite.result.edition_id, editions, participants),
    });
  }

  // Fans tend to remember results as stories: who swept both votes, who won
  // through coalition rather than dominance, and which side's favourite fell
  // furthest once both halves were combined. These are deliberately phrased as
  // descriptive results, not causal claims about why people voted that way.
  const consensusWinner = [...ranked]
    .filter((row) => row.finalRank === 1 && row.juryRank === 1 && row.teleRank === 1)
    .sort((a, b) => b.result.total_points - a.result.total_points)[0];
  if (consensusWinner) {
    const name = countryName(consensusWinner.result.country_id, countries);
    stories.push({
      id: "consensus-winner",
      eyebrow: "No split decision required",
      title: "Jury + televote consensus champion",
      value: "#1 + #1",
      description: `${name} topped both the jury vote and the televote, then won overall.`,
      countryId: consensusWinner.result.country_id,
      ...contextFor(consensusWinner.result.country_id, consensusWinner.result.edition_id, editions, participants),
    });
  }

  const splitDecisionWinner = [...ranked]
    .filter((row) => row.finalRank === 1 && row.juryRank > 1 && row.teleRank > 1)
    .sort((a, b) => (b.juryRank + b.teleRank) - (a.juryRank + a.teleRank))[0];
  if (splitDecisionWinner) {
    const name = countryName(splitDecisionWinner.result.country_id, countries);
    stories.push({
      id: "split-decision-winner",
      eyebrow: "Won the whole thing without winning either half",
      title: "Ultimate compromise winner",
      value: `Jury #${splitDecisionWinner.juryRank} · Tele #${splitDecisionWinner.teleRank}`,
      description: `${name} was not #1 with juries or the televote, but the combined score still put it first overall.`,
      countryId: splitDecisionWinner.result.country_id,
      ...contextFor(splitDecisionWinner.result.country_id, splitDecisionWinner.result.edition_id, editions, participants),
    });
  }

  const fallenJuryWinner = [...ranked]
    .filter((row) => row.juryRank === 1 && row.finalRank > 1)
    .sort((a, b) => b.finalRank - a.finalRank || b.teleRank - a.teleRank)[0];
  if (fallenJuryWinner) {
    const name = countryName(fallenJuryWinner.result.country_id, countries);
    stories.push({
      id: "fallen-jury-winner",
      eyebrow: "The jury trophy was not enough",
      title: "Jury winner that slipped furthest",
      value: `#1 → #${fallenJuryWinner.finalRank}`,
      description: `${name} won the jury vote but ended the combined result in #${fallenJuryWinner.finalRank}.`,
      countryId: fallenJuryWinner.result.country_id,
      ...contextFor(fallenJuryWinner.result.country_id, fallenJuryWinner.result.edition_id, editions, participants),
    });
  }

  const fallenTeleWinner = [...ranked]
    .filter((row) => row.teleRank === 1 && row.finalRank > 1)
    .sort((a, b) => b.finalRank - a.finalRank || b.juryRank - a.juryRank)[0];
  if (fallenTeleWinner) {
    const name = countryName(fallenTeleWinner.result.country_id, countries);
    stories.push({
      id: "fallen-tele-winner",
      eyebrow: "The public favourite still missed the trophy",
      title: "Televote winner that slipped furthest",
      value: `#1 → #${fallenTeleWinner.finalRank}`,
      description: `${name} won the televote but finished #${fallenTeleWinner.finalRank} after jury and public points were combined.`,
      countryId: fallenTeleWinner.result.country_id,
      ...contextFor(fallenTeleWinner.result.country_id, fallenTeleWinner.result.edition_id, editions, participants),
    });
  }

  const closest = [...margins].sort((a, b) => a.margin - b.margin)[0];
  if (closest) {
    const name = countryName(closest.winner.country_id, countries);
    stories.push({
      id: "closest-win",
      eyebrow: "Almost too close to call",
      title: "Closest win",
      value: `${closest.margin} pt${closest.margin === 1 ? "" : "s"}`,
      description: `${name} won by only ${closest.margin} point${closest.margin === 1 ? "" : "s"}.`,
      countryId: closest.winner.country_id,
      ...contextFor(closest.winner.country_id, closest.editionId, editions, participants),
    });
  }

  const landslide = [...margins].sort((a, b) => b.margin - a.margin)[0];
  if (landslide && landslide.margin > 0) {
    const name = countryName(landslide.winner.country_id, countries);
    stories.push({
      id: "landslide",
      eyebrow: "Nobody got close",
      title: "Biggest landslide",
      value: `${landslide.margin} pts`,
      description: `${name} opened the largest winning margin in the selected archive.`,
      countryId: landslide.winner.country_id,
      ...contextFor(landslide.winner.country_id, landslide.editionId, editions, participants),
    });
  }

  const directional = new Map<string, number>();
  for (const vote of jury) {
    if (!vote.voter_country_id || !vote.receiving_country_id || vote.voter_country_id === vote.receiving_country_id) continue;
    const key = `${vote.voter_country_id}>${vote.receiving_country_id}`;
    directional.set(key, (directional.get(key) ?? 0) + vote.points);
  }
  const ids = countries.map((country) => country.id);
  const pairs: Array<{ a: string; b: string; ab: number; ba: number; mutual: number; gap: number }> = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      const ab = directional.get(`${a}>${b}`) ?? 0;
      const ba = directional.get(`${b}>${a}`) ?? 0;
      if (!ab && !ba) continue;
      pairs.push({ a, b, ab, ba, mutual: ab + ba, gap: Math.abs(ab - ba) });
    }
  }

  const mutual = pairs.filter((pair) => pair.ab > 0 && pair.ba > 0).sort((a, b) => b.mutual - a.mutual)[0];
  if (mutual) {
    const aName = countryName(mutual.a, countries);
    const bName = countryName(mutual.b, countries);
    stories.push({
      id: "mutual-pair",
      eyebrow: "Repeated support in both directions",
      title: "Strongest mutual pair",
      value: `${mutual.mutual} pts`,
      description: `${aName} and ${bName} exchanged the most jury points in the selected archive.`,
      countryId: mutual.a,
      secondCountryId: mutual.b,
    });
  }

  const oneSided = [...pairs].sort((a, b) => b.gap - a.gap)[0];
  if (oneSided && oneSided.gap > 0) {
    const giver = oneSided.ab >= oneSided.ba ? oneSided.a : oneSided.b;
    const receiver = giver === oneSided.a ? oneSided.b : oneSided.a;
    const given = Math.max(oneSided.ab, oneSided.ba);
    const returned = Math.min(oneSided.ab, oneSided.ba);
    stories.push({
      id: "one-sided-pair",
      eyebrow: "The affection was not exactly mutual",
      title: "Most one-sided pair",
      value: `${given} → ${returned}`,
      description: `${countryName(giver, countries)} gave ${given} jury points to ${countryName(receiver, countries)}, while ${returned} came back.`,
      countryId: giver,
      secondCountryId: receiver,
    });
  }

  return stories;
}
