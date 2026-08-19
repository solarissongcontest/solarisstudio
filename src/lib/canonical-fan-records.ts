import {
  buildFanRecords,
  type FanRecord,
  type FanRecordHolder,
} from "./fan-records";

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

/**
 * A public record is held by countries, not by raw occurrences. A country can
 * hit the same record in several editions or separate equal-length streaks,
 * but it still appears once in the holder list and counts once in the tie.
 */
export function collapseFanRecordHolders(holders: FanRecordHolder[]): FanRecordHolder[] {
  const byCountry = new Map<string, FanRecordHolder[]>();
  holders.forEach((holder) => {
    byCountry.set(holder.countryId, [...(byCountry.get(holder.countryId) ?? []), holder]);
  });

  return [...byCountry.values()].map((group) => {
    const first = group[0]!;
    if (group.length === 1) return first;

    const editionLabels = uniqueValues(group.map((holder) => holder.editionLabel));
    const contexts = uniqueValues(group.map((holder) => holder.context));
    const artists = uniqueValues(group.map((holder) => holder.artist));
    const songs = uniqueValues(group.map((holder) => holder.song));

    return {
      ...first,
      editionId: undefined,
      editionLabel: editionLabels.length ? editionLabels.join(" · ") : undefined,
      artist: artists.length === 1 ? artists[0] : null,
      song: songs.length === 1 ? songs[0] : null,
      context: contexts.length ? contexts.join(" · ") : null,
    };
  });
}

export function buildCanonicalFanRecords(
  input: Parameters<typeof buildFanRecords>[0],
): FanRecord[] {
  return buildFanRecords(input).map((record) => ({
    ...record,
    holders: collapseFanRecordHolders(record.holders),
  }));
}
