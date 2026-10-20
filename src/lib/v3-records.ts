import type { FanRecord, FanRecordCategory } from "./fan-records";

export type V3RecordCategoryFilter = FanRecordCategory | "all";

export type V3RecordsBundle = {
  rolloutEditionSlug: string | null;
  currentEditionId: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  records: FanRecord[];
  spoilerSafeRecords: FanRecord[];
  editionHrefById: Record<string, string>;
  archivedFinalEditions: number;
  spoilerSafeArchivedFinalEditions: number;
  currentEditionAffectsRecords: boolean;
  generatedAt: string;
};
