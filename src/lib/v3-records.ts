import type { FanRecord, FanRecordHolder } from "./fan-records";

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
