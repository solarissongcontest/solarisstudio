import type { PublicResultCoverage } from "./v3-public-result-snapshots";
import type {
  BroadcastEntry,
  BroadcastIntelligence,
} from "./broadcast-intelligence";

export type V3BroadcastShowOption = {
  id: string;
  name: string;
  kind: string;
  editionId: string;
  editionName: string;
  editionSlug: string;
  editionNumber: number | null;
};

export type V3BroadcastIdentity = {
  id: string;
  name: string;
  shortCode: string;
  flagImage: string | null;
  accentColor: string;
};

export type V3BroadcastIntelligenceBundle = {
  rolloutEditionSlug: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  options: V3BroadcastShowOption[];
  selectedShowId: string | null;
  entries: BroadcastEntry[];
  intelligence: BroadcastIntelligence;
  identities: V3BroadcastIdentity[];
  resultCoverage?: PublicResultCoverage;
  generatedAt: string;
};
