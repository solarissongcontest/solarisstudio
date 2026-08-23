import {
  buildFanRecords,
  type FanRecord,
  type FanRecordHolder,
} from "./fan-records";
import { buildPublicCountryArchive } from "./public-country-archive";
import {
  qualificationCountsAsQualified,
  resolveCountryEditionQualification,
} from "./qualification";

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

type QualificationSegment = {
  countryId: string;
  from: number;
  to: number;
  length: number;
};

function qualificationSegments(
  histories: Map<string, Map<number, boolean>>,
  wanted: boolean,
) {
  const segments: QualificationSegment[] = [];
  histories.forEach((history, countryId) => {
    const ordered = [...history.entries()].sort((a, b) => a[0] - b[0]);
    let start: number | null = null;
    let previous: number | null = null;
    let length = 0;

    for (const [editionNumber, value] of ordered) {
      if (value === wanted && previous != null && editionNumber === previous + 1 && start != null) {
        previous = editionNumber;
        length += 1;
      } else if (value === wanted) {
        start = editionNumber;
        previous = editionNumber;
        length = 1;
      } else {
        start = null;
        previous = editionNumber;
        length = 0;
      }

      if (start != null && length > 0) {
        segments.push({ countryId, from: start, to: editionNumber, length });
      }
    }
  });
  return segments;
}

function buildQualificationRecordOverrides(
  input: Parameters<typeof buildFanRecords>[0],
): FanRecord[] {
  const archive = buildPublicCountryArchive({
    editions: input.editions,
    shows: input.shows,
    participants: input.participants,
    results: input.results,
    jury: [],
    televote: [],
  });
  const histories = new Map<string, Map<number, boolean>>();
  const countryMap = new Map(input.countries.map((country) => [country.id, country]));

  for (const country of input.countries) {
    for (const edition of archive.editions) {
      if (edition.edition_number == null) continue;
      const status = resolveCountryEditionQualification(country.id, edition.id, archive);
      if (status == null) continue;
      const history = histories.get(country.id) ?? new Map<number, boolean>();
      history.set(edition.edition_number, qualificationCountsAsQualified(status));
      histories.set(country.id, history);
    }
  }

  const holder = (segment: QualificationSegment): FanRecordHolder | null => {
    const country = countryMap.get(segment.countryId);
    if (!country) return null;
    return {
      countryId: country.id,
      countryName: country.name,
      shortCode: country.short_code,
      flagImage: country.flag_image,
      accentColor: country.accent_color,
      context:
        segment.from === segment.to
          ? `SSC ${segment.from}`
          : `SSC ${segment.from}–${segment.to}`,
    };
  };

  const longestRecord = (
    id: string,
    label: string,
    wanted: boolean,
    explanation: string,
  ): FanRecord | null => {
    const segments = qualificationSegments(histories, wanted);
    if (!segments.length) return null;
    const best = Math.max(...segments.map((segment) => segment.length));
    const holders = segments
      .filter((segment) => segment.length === best)
      .map(holder)
      .filter((value): value is FanRecordHolder => Boolean(value));
    if (!holders.length) return null;
    return {
      id,
      label,
      value: `${best} edition${best === 1 ? "" : "s"}`,
      category: "streaks",
      explanation,
      holders,
    };
  };

  const records: FanRecord[] = [];
  const longestQ = longestRecord(
    "qualification-streak",
    "Longest qualification streak",
    true,
    "Consecutive editions reaching the Grand Final. Normal qualifiers, auto-qualifiers and Wildcard qualifiers all continue the same streak.",
  );
  const longestNq = longestRecord(
    "nq-streak",
    "Longest non-qualification streak",
    false,
    "Consecutive editions ending without a Grand Final place. AQ and Wildcard appearances are qualifications, not NQs.",
  );
  if (longestQ) records.push(longestQ);
  if (longestNq) records.push(longestNq);

  const currentRuns: QualificationSegment[] = [];
  histories.forEach((history, countryId) => {
    const ordered = [...history.entries()].sort((a, b) => a[0] - b[0]);
    const latest = ordered[ordered.length - 1];
    if (!latest || latest[1] !== true) return;
    let from = latest[0];
    const to = latest[0];
    let length = 1;
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      const [editionNumber, qualified] = ordered[index]!;
      if (!qualified || editionNumber !== from - 1) break;
      from = editionNumber;
      length += 1;
    }
    currentRuns.push({ countryId, from, to, length });
  });

  if (currentRuns.length) {
    const best = Math.max(...currentRuns.map((segment) => segment.length));
    const holders = currentRuns
      .filter((segment) => segment.length === best)
      .map(holder)
      .filter((value): value is FanRecordHolder => Boolean(value));
    if (holders.length) {
      records.push({
        id: "current-qualification-streak",
        label: "Longest current qualification streak",
        value: `${best} edition${best === 1 ? "" : "s"}`,
        category: "streaks",
        explanation:
          "Active run ending at that country's latest known qualification outcome. Q, AQ and Wildcard all keep the run alive.",
        holders,
      });
    }
  }

  return records;
}

export function buildCanonicalFanRecords(
  input: Parameters<typeof buildFanRecords>[0],
): FanRecord[] {
  const overrides = new Map(
    buildQualificationRecordOverrides(input).map((record) => [record.id, record]),
  );
  const base = buildFanRecords(input);
  const seen = new Set<string>();
  const records = base.map((record) => {
    seen.add(record.id);
    return overrides.get(record.id) ?? record;
  });
  overrides.forEach((record, id) => {
    if (!seen.has(id)) records.push(record);
  });

  return records.map((record) => ({
    ...record,
    holders: collapseFanRecordHolders(record.holders),
  }));
}
