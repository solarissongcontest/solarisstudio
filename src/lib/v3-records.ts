import type { FanRecord } from "./fan-records";

export type V3RecordsBundle = {
  rolloutEditionSlug: string | null;
  currentEditionId: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  records: FanRecord[];
  spoilerSafeRecords: FanRecord[];
  archivedFinalEditions: number;
  spoilerSafeArchivedFinalEditions: number;
  currentEditionAffectsRecords: boolean;
  generatedAt: string;
};
