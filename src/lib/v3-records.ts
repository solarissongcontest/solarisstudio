import type { FanRecord } from "./fan-records";

export type V3RecordsBundle = {
  rolloutEditionSlug: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  records: FanRecord[];
  archivedFinalEditions: number;
  generatedAt: string;
};
