import type { Edition, Participant, ResultRow, Show } from "@/lib/data";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";

export type PublicAnniversaryArchiveInput = {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
};

/**
 * Anniversary surfaces are public archive consumers. They must observe the
 * same entry/show/result publication boundary as country history instead of
 * deriving statistics from broad archive queries directly.
 *
 * Jury/televote detail is deliberately omitted because Anniversary needs only
 * public editions, shows, entries and published result rows.
 */
export function buildPublicAnniversaryArchive(input: PublicAnniversaryArchiveInput) {
  const archive = buildPublicCountryArchive({
    editions: input.editions,
    shows: input.shows,
    participants: input.participants,
    results: input.results,
    jury: [],
    televote: [],
  });

  return {
    editions: archive.editions,
    shows: archive.shows,
    participants: archive.participants,
    results: archive.results,
  };
}
