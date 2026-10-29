import type { PublicResultCoverage } from "./v3-public-result-snapshots";
export type V3ScorechartIndexItem = {
  showId: string;
  showName: string;
  showKind: string;
  editionId: string;
  editionName: string;
  editionSlug: string;
  editionNumber: number | null;
};

export type V3ScorechartsBundle = {
  rolloutEditionSlug: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  items: V3ScorechartIndexItem[];
  resultCoverage?: PublicResultCoverage;
  generatedAt: string;
};
