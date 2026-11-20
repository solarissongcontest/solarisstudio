import type { FanRecord, FanRecordCategory } from "./fan-records";

/**
 * Search only the already-built published record projection. Never read
 * ballots, unpublished entrants, or missing source rows for search hints.
 */
export function filterPublishedFanRecords<T extends FanRecord>(
  records: readonly T[],
  category: FanRecordCategory | "all",
  search: string,
): T[] {
  const normalized = search.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (category !== "all" && record.category !== category) return false;
    if (!normalized) return true;
    const fields = [
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
    ];
    return fields.filter((part): part is string => typeof part === "string").join(" ").toLocaleLowerCase().includes(normalized);
  });
}
