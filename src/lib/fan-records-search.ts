import type { FanRecord, FanRecordCategory } from "./fan-records";
import { matchesPublicSearch } from "./public-search";

/**
 * Search only the already-built published record projection. Never read
 * ballots, unpublished entrants, or missing source rows for search hints.
 */
export function filterPublishedFanRecords<T extends FanRecord>(
  records: readonly T[],
  category: FanRecordCategory | "all",
  search: string,
): T[] {
  return records.filter((record) => {
    if (category !== "all" && record.category !== category) return false;

    return matchesPublicSearch(
      search,
      record.label,
      record.value,
      record.explanation,
      ...record.holders.flatMap((holder) => [
        holder.countryName,
        holder.shortCode,
        holder.artist,
        holder.song,
        holder.editionLabel,
      ]),
    );
  });
}
