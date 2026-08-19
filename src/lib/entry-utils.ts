import type { Participant } from "./data";

export type EntryListenLinks = {
  youtube_url?: string | null;
  spotify_url?: string | null;
  apple_music_url?: string | null;
};

export type ParticipantWithListenLinks = Participant & EntryListenLinks;

export function listenLinksFrom(entry?: unknown): Required<EntryListenLinks> {
  const value = (entry ?? {}) as Record<string, unknown>;
  return {
    youtube_url: typeof value.youtube_url === "string" && value.youtube_url.trim() ? value.youtube_url.trim() : null,
    spotify_url: typeof value.spotify_url === "string" && value.spotify_url.trim() ? value.spotify_url.trim() : null,
    apple_music_url: typeof value.apple_music_url === "string" && value.apple_music_url.trim() ? value.apple_music_url.trim() : null,
  };
}

export function hasListenLinks(entry?: unknown) {
  const links = listenLinksFrom(entry);
  return Boolean(links.youtube_url || links.spotify_url || links.apple_music_url);
}

function completeness(entry: ParticipantWithListenLinks) {
  const links = listenLinksFrom(entry);
  return (
    Number(entry.show_id == null) * 100 +
    Number(Boolean(entry.artist?.trim())) * 12 +
    Number(Boolean(entry.song?.trim())) * 12 +
    Number(Boolean(entry.notes?.trim())) * 2 +
    Number(Boolean(links.youtube_url)) * 3 +
    Number(Boolean(links.spotify_url)) * 3 +
    Number(Boolean(links.apple_music_url)) * 3
  );
}

function canonicalIdentity(entry: ParticipantWithListenLinks) {
  return entry.country_id || entry.contest_entity_id || entry.id;
}

/**
 * One canonical entry per delegation per edition. A show appearance is never a
 * second song or participation. The show_id=null row wins when present; older
 * archives fall back to the most complete appearance.
 *
 * The edition is deliberately part of the key. Callers may safely pass rows
 * from several editions without accidentally collapsing a country's whole
 * history into one entry.
 */
export function canonicalEditionEntries(participants: Participant[]): ParticipantWithListenLinks[] {
  const byEditionAndCountry = new Map<string, ParticipantWithListenLinks>();

  for (const raw of participants) {
    const entry = raw as ParticipantWithListenLinks;
    const key = `${entry.edition_id}:${canonicalIdentity(entry)}`;
    const current = byEditionAndCountry.get(key);
    if (!current || completeness(entry) > completeness(current)) {
      byEditionAndCountry.set(key, entry);
    }
  }

  return [...byEditionAndCountry.values()];
}

export function canonicalEntryFor(
  participants: Participant[],
  editionId: string,
  countryId: string,
): ParticipantWithListenLinks | null {
  return (
    canonicalEditionEntries(
      participants.filter(
        (entry) => entry.edition_id === editionId && entry.country_id === countryId,
      ),
    )[0] ?? null
  );
}
