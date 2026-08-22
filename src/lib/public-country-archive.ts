import type {
  Edition,
  JuryVote,
  Participant,
  ResultRow,
  Show,
  Televote,
} from "./data";
import {
  isShowPublic,
  resolveShowPublication,
  showPublishesResults,
  type PublicationConfig,
} from "./publication";

type PublicCountryArchiveInput = {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
  televote: Televote[];
};

type EditionPublication = PublicationConfig;

const EMPTY_PUBLICATION: EditionPublication = {
  participants: false,
  artists: false,
  songs: false,
  semi_split: false,
  running_order: false,
  qualifiers: false,
  results: false,
  jury_results: false,
  televote_results: false,
  detailed_voting: false,
};

function mergePublication(
  current: EditionPublication | undefined,
  next: PublicationConfig,
): EditionPublication {
  const base = current ?? EMPTY_PUBLICATION;
  return {
    participants: base.participants || next.participants,
    artists: base.artists || next.artists,
    songs: base.songs || next.songs,
    semi_split: base.semi_split || next.semi_split,
    running_order: base.running_order || next.running_order,
    qualifiers: base.qualifiers || next.qualifiers,
    results: base.results || next.results,
    jury_results: base.jury_results || next.jury_results,
    televote_results: base.televote_results || next.televote_results,
    detailed_voting: base.detailed_voting || next.detailed_voting,
  };
}

/**
 * Entry visibility is independent from show-layer visibility. A show can have
 * its participant/artist/song layers enabled while an individual delegation's
 * entry is still a draft or scheduled for a future reveal. Public country and
 * wiki pages must respect both gates, especially for organizers who can read
 * the raw participant row through RLS.
 */
function isEntryRevealed(participant: Participant, nowMs = Date.now()): boolean {
  if (participant.publication_status === "published") return true;
  if (
    participant.publication_status === "scheduled" &&
    participant.scheduled_publish_at
  ) {
    const scheduledMs = Date.parse(participant.scheduled_publish_at);
    return Number.isFinite(scheduledMs) && scheduledMs <= nowMs;
  }
  return false;
}

function sanitiseParticipant(
  participant: Participant,
  publication: PublicationConfig,
): Participant {
  const entryRevealed = isEntryRevealed(participant);
  const artistVisible = entryRevealed && publication.artists;
  const songVisible = entryRevealed && publication.songs;

  return {
    ...participant,
    artist: artistVisible ? participant.artist : null,
    song: songVisible ? participant.song : null,
    youtube_url: songVisible ? participant.youtube_url : null,
    spotify_url: songVisible ? participant.spotify_url : null,
    apple_music_url: songVisible ? participant.apple_music_url : null,
    notes: null,
    running_order: publication.running_order ? participant.running_order : null,
    semi_final: publication.semi_split ? participant.semi_final : "",
    qualified: publication.qualifiers ? participant.qualified : null,
  };
}

/**
 * Public country profiles must never infer history from operational rows that
 * have not been published yet. Admins often open the public site while still
 * authenticated, so RLS alone is not enough: organizer SELECT access would
 * otherwise expose draft ranks/zero-point placeholders or unrevealed entries
 * through public UI.
 *
 * This creates a publication-safe archive for country profile statistics and
 * lists. A show can be publicly visible for participants while an individual
 * entry or its result rows stay completely invisible until their own release
 * gates are enabled.
 */
export function buildPublicCountryArchive(
  input: PublicCountryArchiveInput,
): PublicCountryArchiveInput {
  const editions = input.editions.filter((edition) => edition.published);
  const publishedEditionIds = new Set(editions.map((edition) => edition.id));

  const shows = input.shows.filter(
    (show) => publishedEditionIds.has(show.edition_id) && isShowPublic(show),
  );
  const showById = new Map(shows.map((show) => [show.id, show]));
  const publicationByShow = new Map(
    shows.map((show) => [show.id, resolveShowPublication(show)]),
  );

  const publicationByEdition = new Map<string, EditionPublication>();
  for (const show of shows) {
    publicationByEdition.set(
      show.edition_id,
      mergePublication(
        publicationByEdition.get(show.edition_id),
        resolveShowPublication(show),
      ),
    );
  }

  const participants = input.participants.flatMap((participant) => {
    if (!publishedEditionIds.has(participant.edition_id)) return [];

    if (participant.show_id) {
      const publication = publicationByShow.get(participant.show_id);
      if (!publication?.participants) return [];
      return [sanitiseParticipant(participant, publication)];
    }

    // Canonical edition-level participant rows are useful for keeping one
    // entry identity across semi/final stages. They may only expose fields that
    // at least one public show in that edition has actually revealed, and the
    // delegation's own entry reveal gate must have opened too.
    const publication = publicationByEdition.get(participant.edition_id);
    if (!publication?.participants) return [];
    return [sanitiseParticipant(participant, publication)];
  });

  const results = input.results.filter((result) => {
    if (!publishedEditionIds.has(result.edition_id) || !result.show_id) return false;
    return showPublishesResults(showById.get(result.show_id));
  });

  // These tables contain directional voting detail. Aggregate result totals can
  // be public without individual ballots being public, so raw voting rows only
  // enter public country analytics when detailed voting is released.
  const jury = input.jury.filter((vote) => {
    if (!publishedEditionIds.has(vote.edition_id) || !vote.show_id) return false;
    return publicationByShow.get(vote.show_id)?.detailed_voting === true;
  });

  const televote = input.televote.filter((vote) => {
    if (!publishedEditionIds.has(vote.edition_id) || !vote.show_id) return false;
    return publicationByShow.get(vote.show_id)?.detailed_voting === true;
  });

  return {
    editions,
    shows,
    participants,
    results,
    jury,
    televote,
  };
}
