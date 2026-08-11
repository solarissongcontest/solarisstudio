import type { ResultRow } from "@/lib/data";

export type HomeNewsCountry = {
  id: string;
  name: string;
};

export type HomeNewsStory = {
  id: string;
  label: string;
  headline: string;
  detail: string;
  countryId?: string;
  intensity: "breaking" | "strong" | "standard";
};

type NamedResult = {
  id: string;
  countryId: string;
  name: string;
  juryPoints: number;
  televotePoints: number;
  totalPoints: number;
  finalRank: number;
};

function safe(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function rankBy(entries: NamedResult[], key: "juryPoints" | "televotePoints" | "totalPoints") {
  return [...entries]
    .sort((a, b) => b[key] - a[key] || a.finalRank - b.finalRank || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, channelRank: index + 1 }));
}

export function namedResults(
  results: ResultRow[],
  nameForCountry: (id: string) => string,
): NamedResult[] {
  return results
    .filter((result) => Boolean(result.country_id) && result.final_rank != null)
    .map((result) => ({
      id: result.id,
      countryId: result.country_id,
      name: nameForCountry(result.country_id),
      juryPoints: safe(result.jury_points),
      televotePoints: safe(result.televote_points),
      totalPoints: safe(result.total_points),
      finalRank: result.final_rank as number,
    }))
    .sort((a, b) => a.finalRank - b.finalRank || b.totalPoints - a.totalPoints);
}

export function runnerUpStory(entries: NamedResult[]): HomeNewsStory | null {
  const winner = entries.find((entry) => entry.finalRank === 1) ?? entries[0];
  const runnerUp = entries.find((entry) => entry.finalRank === 2) ?? entries[1];
  if (!winner || !runnerUp) return null;

  const gap = Math.max(0, winner.totalPoints - runnerUp.totalPoints);

  if (gap <= 3) {
    return {
      id: "runner-up-photo-finish",
      label: "Photo finish",
      headline: `DID ${runnerUp.name.toUpperCase()} ALMOST STEAL THE WIN?!`,
      detail: `Only ${gap} point${gap === 1 ? "" : "s"} separated ${runnerUp.name} from ${winner.name}. One tiny swing could have rewritten the result.`,
      countryId: runnerUp.countryId,
      intensity: "breaking",
    };
  }

  if (gap <= 10) {
    return {
      id: "runner-up-close",
      label: "Close call",
      headline: `${runnerUp.name} came within ${gap} points of taking the trophy`,
      detail: `${winner.name} won, but the runner-up stayed close enough for the final margin to matter.`,
      countryId: runnerUp.countryId,
      intensity: "breaking",
    };
  }

  if (gap <= 25) {
    return {
      id: "runner-up-pressure",
      label: "Runner-up",
      headline: `${runnerUp.name} kept ${winner.name} under real pressure`,
      detail: `The final gap was ${gap} points. Not a photo finish, but never a comfortable runaway either.`,
      countryId: runnerUp.countryId,
      intensity: "strong",
    };
  }

  if (gap <= 60) {
    return {
      id: "runner-up-clear",
      label: "Runner-up",
      headline: `${runnerUp.name} came second as ${winner.name} built a clear lead`,
      detail: `${runnerUp.name} finished ${gap} points behind the winner and still secured second place.`,
      countryId: runnerUp.countryId,
      intensity: "standard",
    };
  }

  return {
    id: "runner-up-distant",
    label: "Runner-up",
    headline: `${runnerUp.name} finished second, but ${winner.name} was out of reach`,
    detail: `A ${gap}-point winning margin made this a decisive result rather than a last-second escape.`,
    countryId: runnerUp.countryId,
    intensity: "standard",
  };
}

export function winnerLeadStory(entries: NamedResult[], showName: string): HomeNewsStory | null {
  const winner = entries.find((entry) => entry.finalRank === 1) ?? entries[0];
  const runnerUp = entries.find((entry) => entry.finalRank === 2) ?? entries[1];
  if (!winner) return null;

  const gap = runnerUp ? Math.max(0, winner.totalPoints - runnerUp.totalPoints) : null;

  if (gap != null && gap <= 3) {
    return {
      id: "lead-photo-finish",
      label: "Breaking result",
      headline: `${winner.name} WINS ${showName.toUpperCase()} BY THE THINNEST OF MARGINS`,
      detail: `${winner.name} survived a ${gap}-point finish. This one was close enough to make every last point look suspiciously important.`,
      countryId: winner.countryId,
      intensity: "breaking",
    };
  }

  if (gap != null && gap >= 80) {
    return {
      id: "lead-landslide",
      label: "Result",
      headline: `${winner.name} storms to a commanding ${showName} victory`,
      detail: `${winner.name} won by ${gap} points, turning the top of the scoreboard into a statement rather than a suspense plot.`,
      countryId: winner.countryId,
      intensity: "strong",
    };
  }

  return {
    id: "lead-standard",
    label: "Result",
    headline: `${winner.name} wins ${showName} — now look at how the vote got there`,
    detail: `${winner.name} finished on ${winner.totalPoints} points${gap == null ? "" : `, ${gap} ahead of second place`}. The final ranking only tells half the story.`,
    countryId: winner.countryId,
    intensity: "strong",
  };
}

export function votingStories(entries: NamedResult[]): HomeNewsStory[] {
  if (entries.length < 2) return [];

  const stories: HomeNewsStory[] = [];
  const jury = rankBy(entries, "juryPoints");
  const televote = rankBy(entries, "televotePoints");
  const winner = entries.find((entry) => entry.finalRank === 1) ?? entries[0];
  const juryWinner = jury[0];
  const teleWinner = televote[0];

  if (winner && juryWinner && juryWinner.countryId !== winner.countryId) {
    stories.push({
      id: "jury-overturned",
      label: "Jury shock",
      headline: `${juryWinner.name} won the jury — and STILL did not win the contest`,
      detail: `${juryWinner.name} led the jury vote with ${juryWinner.juryPoints} points, but the combined result handed victory to ${winner.name}.`,
      countryId: juryWinner.countryId,
      intensity: "breaking",
    });
  } else if (winner && juryWinner?.countryId === winner.countryId) {
    stories.push({
      id: "jury-backed-winner",
      label: "Jury vote",
      headline: `${winner.name} won the jury and converted it into the overall victory`,
      detail: `The eventual winner also topped the jury ranking with ${winner.juryPoints} jury points.`,
      countryId: winner.countryId,
      intensity: "standard",
    });
  }

  if (winner && teleWinner && teleWinner.countryId !== winner.countryId) {
    stories.push({
      id: "tele-winner-lost",
      label: "Televote twist",
      headline: `The public put ${teleWinner.name} first. The trophy went somewhere else.`,
      detail: `${teleWinner.name} won the televote with ${teleWinner.televotePoints} points, while ${winner.name} won the combined scoreboard.`,
      countryId: teleWinner.countryId,
      intensity: "breaking",
    });
  } else if (winner && teleWinner?.countryId === winner.countryId) {
    stories.push({
      id: "tele-backed-winner",
      label: "Televote",
      headline: `${winner.name} took the televote too — the public helped seal the win`,
      detail: `${winner.televotePoints} televote points gave the overall winner the strongest public score in the field.`,
      countryId: winner.countryId,
      intensity: "strong",
    });
  }

  const biggestTeleSurge = [...entries]
    .map((entry) => ({ ...entry, gap: entry.televotePoints - entry.juryPoints }))
    .sort((a, b) => b.gap - a.gap)[0];

  if (biggestTeleSurge && biggestTeleSurge.gap >= 20) {
    const wording = biggestTeleSurge.gap >= 100
      ? `${biggestTeleSurge.name} was RESCUED by the televote`
      : `${biggestTeleSurge.name} got a major lift from the televote`;
    stories.push({
      id: "biggest-tele-surge",
      label: "Public boost",
      headline: wording,
      detail: `The public gave ${biggestTeleSurge.name} ${biggestTeleSurge.gap} more points than the jury did.`,
      countryId: biggestTeleSurge.countryId,
      intensity: biggestTeleSurge.gap >= 100 ? "breaking" : "strong",
    });
  }

  const biggestJuryBoost = [...entries]
    .map((entry) => ({ ...entry, gap: entry.juryPoints - entry.televotePoints }))
    .sort((a, b) => b.gap - a.gap)[0];

  if (biggestJuryBoost && biggestJuryBoost.gap >= 20) {
    stories.push({
      id: "biggest-jury-boost",
      label: "Jury favourite",
      headline: `${biggestJuryBoost.name} was far more popular with juries than with the public`,
      detail: `Its jury score was ${biggestJuryBoost.gap} points higher than its televote score.`,
      countryId: biggestJuryBoost.countryId,
      intensity: biggestJuryBoost.gap >= 100 ? "strong" : "standard",
    });
  }

  return stories;
}

export function placementStories(entries: NamedResult[]): HomeNewsStory[] {
  const stories: HomeNewsStory[] = [];
  if (entries.length < 3) return stories;

  const juryRanks = new Map(rankBy(entries, "juryPoints").map((entry) => [entry.countryId, entry.channelRank]));

  const biggestRise = [...entries]
    .map((entry) => ({
      ...entry,
      juryRank: juryRanks.get(entry.countryId) ?? entry.finalRank,
      movement: (juryRanks.get(entry.countryId) ?? entry.finalRank) - entry.finalRank,
    }))
    .sort((a, b) => b.movement - a.movement)[0];

  if (biggestRise && biggestRise.movement >= 4) {
    stories.push({
      id: "jury-to-final-rise",
      label: "Comeback",
      headline: `${biggestRise.name} climbed ${biggestRise.movement} places after the jury ranking`,
      detail: `It sat #${biggestRise.juryRank} on jury points but finished #${biggestRise.finalRank} overall.`,
      countryId: biggestRise.countryId,
      intensity: biggestRise.movement >= 8 ? "breaking" : "strong",
    });
  }

  const biggestFall = [...entries]
    .map((entry) => ({
      ...entry,
      juryRank: juryRanks.get(entry.countryId) ?? entry.finalRank,
      movement: entry.finalRank - (juryRanks.get(entry.countryId) ?? entry.finalRank),
    }))
    .sort((a, b) => b.movement - a.movement)[0];

  if (biggestFall && biggestFall.movement >= 4) {
    stories.push({
      id: "jury-to-final-fall",
      label: "Scoreboard fall",
      headline: `${biggestFall.name} fell ${biggestFall.movement} places once the full vote came together`,
      detail: `A #${biggestFall.juryRank} jury position became #${biggestFall.finalRank} overall.`,
      countryId: biggestFall.countryId,
      intensity: biggestFall.movement >= 8 ? "strong" : "standard",
    });
  }

  const second = entries.find((entry) => entry.finalRank === 2) ?? entries[1];
  const third = entries.find((entry) => entry.finalRank === 3) ?? entries[2];
  if (second && third) {
    const gap = Math.max(0, second.totalPoints - third.totalPoints);
    if (gap <= 5) {
      stories.push({
        id: "podium-fight",
        label: "Podium fight",
        headline: `${third.name} was only ${gap} point${gap === 1 ? "" : "s"} away from second place`,
        detail: `The fight just below the winner was almost as tight as the top of the scoreboard.`,
        countryId: third.countryId,
        intensity: "strong",
      });
    }
  }

  return stories;
}

export function buildHomeNewsroomStories(entries: NamedResult[]): HomeNewsStory[] {
  const candidates = [
    runnerUpStory(entries),
    ...votingStories(entries),
    ...placementStories(entries),
  ].filter((story): story is HomeNewsStory => Boolean(story));

  const weight = { breaking: 3, strong: 2, standard: 1 } as const;

  return candidates
    .filter((story, index, list) => list.findIndex((other) => other.id === story.id) === index)
    .sort((a, b) => weight[b.intensity] - weight[a.intensity])
    .slice(0, 8);
}
