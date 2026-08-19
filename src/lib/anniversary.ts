import type { Country, Edition, Participant, ResultRow, Show } from "@/lib/data";

export const SOLARIS_BIRTH_DATE = "2022-09-17";
export const SOLARIS_ANNIVERSARY_TIME_ZONE = "Europe/Paris";

export type SolarisAnniversary = {
  active: boolean;
  year: number;
  age: number;
  ordinal: string;
  previousYear: number;
  dateLabel: string;
};

export type AnniversaryStory = {
  id: string;
  kicker: string;
  headline: string;
  detail: string;
  value?: string;
};

export type AnniversaryRecap = {
  editionCount: number;
  showCount: number;
  entryCount: number;
  countryCount: number;
  grandFinalCount: number;
  winners: Array<{ countryId: string; name: string; points: number; edition: string }>;
  closestFinal: { gap: number; winner: string; runnerUp: string; edition: string } | null;
  biggestWinner: { name: string; points: number; edition: string } | null;
  stories: AnniversaryStory[];
};

function dateParts(date: Date, timeZone = SOLARIS_ANNIVERSARY_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return { year: value("year"), month: value("month"), day: value("day") };
}

export function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function getSolarisAnniversary(date = new Date()): SolarisAnniversary {
  const { year, month, day } = dateParts(date);
  const age = Math.max(0, year - 2022);

  return {
    active: month === 9 && day === 17 && year >= 2022,
    year,
    age,
    ordinal: ordinal(age),
    previousYear: year - 1,
    dateLabel: `17 September ${year}`,
  };
}

function editionName(edition?: Edition | null) {
  if (!edition) return "Solaris Song Contest";
  return edition.edition_number != null ? `SSC ${edition.edition_number}` : edition.name;
}

function participationIdentity(entry: Participant) {
  return entry.country_id || entry.contest_entity_id || entry.id;
}

export function buildAnniversaryRecap({
  anniversaryYear,
  editions,
  shows,
  participants,
  results,
  countries,
}: {
  anniversaryYear: number;
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  countries: Country[];
}): AnniversaryRecap {
  const published = editions.filter((edition) => edition.published);
  const currentYear = published.filter((edition) => edition.year === anniversaryYear);
  const previousYear = published.filter((edition) => edition.year === anniversaryYear - 1);

  // Edition rows currently store a contest year rather than an exact public date.
  // Prefer the current anniversary year's chapters and include the final previous-year
  // chapter to bridge the period beginning on the previous 17 September.
  const bridgeEdition = [...previousYear].sort(
    (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
  )[0];
  const periodEditions = [...(bridgeEdition ? [bridgeEdition] : []), ...currentYear].filter(
    (edition, index, list) => list.findIndex((item) => item.id === edition.id) === index,
  );
  const selected = periodEditions.length
    ? periodEditions
    : [...published]
        .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))
        .slice(0, 4);

  const editionIds = new Set(selected.map((edition) => edition.id));
  const editionMap = new Map(selected.map((edition) => [edition.id, edition]));
  const periodShows = shows.filter((show) => show.published && editionIds.has(show.edition_id));
  const showIds = new Set(periodShows.map((show) => show.id));
  const periodParticipants = participants.filter((entry) => editionIds.has(entry.edition_id));
  const participationKeys = new Set(
    periodParticipants.map((entry) => `${entry.edition_id}:${participationIdentity(entry)}`),
  );
  const periodResults = results.filter(
    (result) => editionIds.has(result.edition_id) && (!result.show_id || showIds.has(result.show_id)),
  );
  const countryMap = new Map(countries.map((country) => [country.id, country]));
  const participatingCountries = new Set(periodParticipants.map((entry) => entry.country_id).filter(Boolean));
  const grandFinalShows = periodShows.filter((show) => show.kind === "grand-final" || show.kind === "final");

  const winners: AnniversaryRecap["winners"] = [];
  let closestFinal: AnniversaryRecap["closestFinal"] = null;
  let biggestWinner: AnniversaryRecap["biggestWinner"] = null;

  for (const show of grandFinalShows) {
    const ranking = periodResults
      .filter((result) => result.show_id === show.id && result.final_rank != null)
      .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
    const winner = ranking[0];
    if (!winner || winner.final_rank !== 1) continue;

    const winnerName = countryMap.get(winner.country_id)?.name ?? "Unknown country";
    const edition = editionMap.get(show.edition_id);
    winners.push({
      countryId: winner.country_id,
      name: winnerName,
      points: winner.total_points ?? 0,
      edition: editionName(edition),
    });

    if (!biggestWinner || (winner.total_points ?? 0) > biggestWinner.points) {
      biggestWinner = {
        name: winnerName,
        points: winner.total_points ?? 0,
        edition: editionName(edition),
      };
    }

    const runnerUp = ranking[1];
    if (runnerUp) {
      const gap = Math.max(0, (winner.total_points ?? 0) - (runnerUp.total_points ?? 0));
      if (!closestFinal || gap < closestFinal.gap) {
        closestFinal = {
          gap,
          winner: winnerName,
          runnerUp: countryMap.get(runnerUp.country_id)?.name ?? "the runner-up",
          edition: editionName(edition),
        };
      }
    }
  }

  const stories: AnniversaryStory[] = [];

  stories.push({
    id: "growth",
    kicker: "The anniversary year",
    headline:
      selected.length === 1
        ? `${editionName(selected[0])} carried Solaris into another birthday`
        : `${selected.length} contest chapters shaped the year since the last birthday`,
    detail: `${periodShows.length} public shows and ${participatingCountries.size} countries make up this anniversary chapter of Solaris history.`,
    value: `${selected.length} editions`,
  });

  if (closestFinal) {
    stories.push({
      id: "closest-final",
      kicker: "Closest finish",
      headline:
        closestFinal.gap <= 3
          ? `${closestFinal.runnerUp} came frighteningly close to stealing the trophy`
          : closestFinal.gap <= 10
            ? `${closestFinal.runnerUp} pushed ${closestFinal.winner} all the way`
            : `${closestFinal.winner} survived the tightest final of the anniversary year`,
      detail: `${closestFinal.edition} was decided by ${closestFinal.gap} point${closestFinal.gap === 1 ? "" : "s"}.`,
      value: `${closestFinal.gap} pts`,
    });
  }

  if (biggestWinner) {
    stories.push({
      id: "biggest-score",
      kicker: "Biggest winning score",
      headline: `${biggestWinner.name} produced the anniversary year's biggest winning total`,
      detail: `${biggestWinner.points} points in ${biggestWinner.edition}.`,
      value: `${biggestWinner.points} pts`,
    });
  }

  if (winners.length > 1) {
    stories.push({
      id: "champions",
      kicker: "New champions",
      headline: `${winners.length} trophies changed the Solaris history books`,
      detail: winners.map((winner) => `${winner.name} (${winner.edition})`).join(" · "),
      value: `${winners.length} winners`,
    });
  } else if (winners[0]) {
    stories.push({
      id: "champion",
      kicker: "Champion of the year",
      headline: `${winners[0].name} joined the Solaris winners' circle`,
      detail: `${winners[0].edition} ended with ${winners[0].name} on top on ${winners[0].points} points.`,
      value: "1 champion",
    });
  }

  if (participatingCountries.size >= 20) {
    stories.push({
      id: "countries",
      kicker: "Across Terra Solaris",
      headline: `${participatingCountries.size} countries were part of the contest story`,
      detail: "Delegations across Terra Solaris added entries, results, rivalries and another year of increasingly unreasonable scoreboard emotions.",
      value: `${participatingCountries.size} countries`,
    });
  }

  return {
    editionCount: selected.length,
    showCount: periodShows.length,
    entryCount: participationKeys.size,
    countryCount: participatingCountries.size,
    grandFinalCount: grandFinalShows.length,
    winners,
    closestFinal,
    biggestWinner,
    stories: stories.slice(0, 6),
  };
}
