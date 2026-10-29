import type { PublicResultCoverage } from "./v3-public-result-snapshots";
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
  resultCoverage?: PublicResultCoverage;
  generatedAt: string;
};
