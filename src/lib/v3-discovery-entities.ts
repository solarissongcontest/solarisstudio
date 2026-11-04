import { resolveCurrentPublicEdition } from "./current-contest-state";
import type { Country, Edition, Participant, Show } from "./data";
import { normalizeLegacyEditionStatus } from "./edition-state";
import { isShowPublic } from "./publication";
import { showModeConfig } from "./show-mode";

type PublicParticipant = Participant & {
  participation_status?: "confirmed" | "withdrawn" | "disqualified" | null;
};

export type CountryDiscovery = {
  currentEdition: Edition | null;
  participating: Country[];
  debuting: Country[];
  withdrawn: Country[];
  disqualified: Country[];
  notParticipating: Country[];
  regions: Array<{ name: string; countries: Country[] }>;
};

export type ShowDiscoveryState =
  | "live"
  | "paused"
  | "delayed"
  | "preparing"
  | "scheduled"
  | "ended"
  | "cancelled"
  | "other";

export type ShowDiscoveryItem = {
  show: Show;
  edition: Edition;
  state: ShowDiscoveryState;
  stateLabel: string;
  scheduledStart: string | null;
  broadcastUrl: string | null;
};

export type ShowDiscovery = {
  currentEdition: Edition | null;
  liveNow: ShowDiscoveryItem[];
  upNext: ShowDiscoveryItem[];
  recent: ShowDiscoveryItem[];
  currentEditionShows: ShowDiscoveryItem[];
  archive: ShowDiscoveryItem[];
};

function isTerminalEdition(edition: Edition) {
  const state = normalizeLegacyEditionStatus(edition.status);
  return state === "post_edition" || state === "archived";
}

export function resolveActivePublicEdition(editions: readonly Edition[]) {
  const edition = resolveCurrentPublicEdition(editions);
  return edition && !isTerminalEdition(edition) ? edition : null;
}

function byCountryName(left: Country, right: Country) {
  return left.name.localeCompare(right.name);
}

export function buildCountryDiscovery(input: {
  countries: readonly Country[];
  editions: readonly Edition[];
  currentParticipants: readonly PublicParticipant[];
}): CountryDiscovery {
  const currentEdition = resolveActivePublicEdition(input.editions);
  const countryById = new Map(input.countries.map((country) => [country.id, country]));
  const statusByCountry = new Map<string, PublicParticipant["participation_status"]>();

  if (currentEdition) {
    for (const participant of input.currentParticipants) {
      if (participant.edition_id !== currentEdition.id || !participant.country_id) continue;
      const status = participant.participation_status ?? "confirmed";
      const existing = statusByCountry.get(participant.country_id);
      if (existing === "disqualified") continue;
      if (status === "disqualified" || existing == null || status === "withdrawn") {
        statusByCountry.set(participant.country_id, status);
      }
    }
  }

  const withStatus = (status: PublicParticipant["participation_status"]) =>
    [...statusByCountry.entries()]
      .filter(([, value]) => value === status)
      .flatMap(([countryId]) => {
        const country = countryById.get(countryId);
        return country ? [country] : [];
      })
      .sort(byCountryName);

  const participating = withStatus("confirmed");
  const withdrawn = withStatus("withdrawn");
  const disqualified = withStatus("disqualified");
  const debuting = currentEdition?.edition_number == null
    ? []
    : participating.filter(
        (country) => country.first_participation === currentEdition.edition_number,
      );
  const visibleCurrentIds = new Set(statusByCountry.keys());
  const notParticipating = currentEdition
    ? input.countries.filter((country) => !visibleCurrentIds.has(country.id)).sort(byCountryName)
    : [];

  const regionMap = new Map<string, Country[]>();
  for (const country of input.countries) {
    const region = country.region?.trim() || "Other";
    regionMap.set(region, [...(regionMap.get(region) ?? []), country]);
  }

  const regions = [...regionMap.entries()]
    .map(([name, countries]) => ({ name, countries: countries.sort(byCountryName) }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    currentEdition,
    participating,
    debuting,
    withdrawn,
    disqualified,
    notParticipating,
    regions,
  };
}

function canonicalShowState(show: Show): ShowDiscoveryState {
  const status = show.status.trim().toLowerCase().replaceAll("-", "_");
  const phase = showModeConfig(show).phase;

  if (status === "paused") return "paused";
  if (status === "delayed") return "delayed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "ended" || phase === "ended") return "ended";
  if (
    status === "live" ||
    status === "on_air" ||
    status === "in_progress" ||
    phase === "live" ||
    phase === "results_in_progress"
  ) {
    return "live";
  }
  if (status === "preparing") return "preparing";
  if (status === "scheduled" || phase === "scheduled") return "scheduled";
  return "other";
}

function stateLabel(state: ShowDiscoveryState) {
  switch (state) {
    case "live":
      return "Live";
    case "paused":
      return "Paused";
    case "delayed":
      return "Delayed";
    case "preparing":
      return "Preparing";
    case "scheduled":
      return "Scheduled";
    case "ended":
      return "Ended";
    case "cancelled":
      return "Cancelled";
    case "other":
      return "Show";
  }
}

function scheduledTime(item: ShowDiscoveryItem) {
  if (!item.scheduledStart) return Number.POSITIVE_INFINITY;
  const value = Date.parse(item.scheduledStart);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function sortUpcoming(left: ShowDiscoveryItem, right: ShowDiscoveryItem) {
  return (
    scheduledTime(left) - scheduledTime(right) ||
    left.show.sort_order - right.show.sort_order ||
    left.show.id.localeCompare(right.show.id)
  );
}

function sortArchive(left: ShowDiscoveryItem, right: ShowDiscoveryItem) {
  return (
    (right.edition.edition_number ?? -1) - (left.edition.edition_number ?? -1) ||
    right.show.sort_order - left.show.sort_order ||
    left.show.id.localeCompare(right.show.id)
  );
}

export function buildShowDiscovery(input: {
  editions: readonly Edition[];
  shows: readonly Show[];
}): ShowDiscovery {
  const currentEdition = resolveActivePublicEdition(input.editions);
  const editionById = new Map(
    input.editions.filter((edition) => edition.published).map((edition) => [edition.id, edition]),
  );

  const items = input.shows.flatMap<ShowDiscoveryItem>((show) => {
    if (!isShowPublic(show)) return [];
    const edition = editionById.get(show.edition_id);
    if (!edition) return [];
    const config = showModeConfig(show);
    const state = canonicalShowState(show);
    let broadcastUrl: string | null = null;
    try {
      const raw = config.youtubeUrl?.trim();
      if (raw) {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        if (
          url.protocol === "https:" &&
          (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be")
        ) {
          broadcastUrl = url.toString();
        }
      }
    } catch {
      broadcastUrl = null;
    }

    return [{
      show,
      edition,
      state,
      stateLabel: stateLabel(state),
      scheduledStart: config.scheduledStart || null,
      broadcastUrl,
    }];
  });

  const liveNow = items
    .filter((item) => item.state === "live" || item.state === "paused")
    .sort(sortUpcoming);
  const upNext = items
    .filter(
      (item) =>
        item.state === "scheduled" ||
        item.state === "preparing" ||
        item.state === "delayed",
    )
    .sort(sortUpcoming);
  const currentEditionShows = currentEdition
    ? items
        .filter((item) => item.edition.id === currentEdition.id)
        .sort((left, right) => left.show.sort_order - right.show.sort_order)
    : [];
  const recent = currentEditionShows
    .filter((item) => item.state === "ended" || item.state === "cancelled")
    .slice()
    .sort((left, right) => right.show.sort_order - left.show.sort_order)
    .slice(0, 4);
  const archive = items
    .filter((item) => !currentEdition || item.edition.id !== currentEdition.id)
    .sort(sortArchive);

  return {
    currentEdition,
    liveNow,
    upNext,
    recent,
    currentEditionShows,
    archive,
  };
}
