import type { FanRecord, FanRecordCategory, FanRecordHolder } from "./fan-records";

export type V3RecordCategoryFilter = FanRecordCategory | "all";

const RECORD_CATEGORY_FILTERS: readonly V3RecordCategoryFilter[] = [
  "career", "streaks", "edition", "voting", "regional", "unusual", "all",
];

/**
 * URL category state is navigation-only; canonical publication and spoilers
 * continue to be enforced by the server-authoritative Records projection.
 */
export function parseV3RecordCategorySearch(search: unknown): {
  category: V3RecordCategoryFilter;
  shouldNormalize: boolean;
} {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return { category: "career", shouldNormalize: false };
  }
  const params = search as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(params, "category") || params.category === undefined) {
    return { category: "career", shouldNormalize: false };
  }
  const raw = params.category;
  if (typeof raw !== "string" || raw === "career" ||
      !RECORD_CATEGORY_FILTERS.includes(raw as V3RecordCategoryFilter)) {
    return { category: "career", shouldNormalize: true };
  }
  return { category: raw as V3RecordCategoryFilter, shouldNormalize: false };
}


export type V3RecordProvenance = {
  kind: "result" | "voting" | "edition";
  label: string;
  href: string;
};

export type V3RecordHolder = FanRecordHolder & {
  provenance: V3RecordProvenance | null;
};

export type V3Record = Omit<FanRecord, "holders"> & {
  holders: V3RecordHolder[];
};

export type V3RecordsBundle = {
  rolloutEditionSlug: string | null;
  currentEditionId: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  records: V3Record[];
  spoilerSafeRecords: V3Record[];
  archivedFinalEditions: number;
  spoilerSafeArchivedFinalEditions: number;
  currentEditionAffectsRecords: boolean;
  generatedAt: string;
};
