import type { PublicResultCoverage } from "./v3-public-result-snapshots";
import type {
  ResultLabJuryVote,
  ResultLabOfficialEntry,
} from "./result-lab";

export type V3ResultLabShowOption = {
  id: string;
  name: string;
  kind: string;
  editionId: string;
  editionName: string;
  editionSlug: string;
  editionNumber: number | null;
};

export type V3ResultLabIdentity = {
  id: string;
  name: string;
  shortCode: string;
  flagImage: string | null;
  accentColor: string;
};

export type V3ResultLabVoter = {
  key: string;
  name: string;
  shortCode: string | null;
  flagImage: string | null;
  accentColor: string;
};

export type V3ResultLabBundle = {
  rolloutEditionSlug: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  options: V3ResultLabShowOption[];
  selectedShowId: string | null;
  detailedVotingPublic: boolean;
  officialEntries: ResultLabOfficialEntry[];
  juryVotes: ResultLabJuryVote[];
  voters: V3ResultLabVoter[];
  identities: V3ResultLabIdentity[];
  resultCoverage?: PublicResultCoverage;
  generatedAt: string;
};
