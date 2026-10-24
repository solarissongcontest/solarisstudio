export type V3PublicVotingDnaRelationship = {
  countryId: string;
  points: number;
  ballots: number;
};

export type V3PublicVotingDnaResult = {
  editionId: string;
  showId: string;
  finalRank: number | null;
  totalPoints: number;
  juryPublished: boolean;
  juryPoints: number | null;
  televotePublished: boolean;
  televotePoints: number | null;
};

export type V3PublicVotingDna = {
  schemaVersion: 1;
  formulaVersion: "v1";
  sample: {
    detailedEditions: number;
    detailedEditionIds: string[];
    givenPoints: number;
    receivedPoints: number;
    resultEditions: number;
  };
  topGiven: V3PublicVotingDnaRelationship[];
  topReceived: V3PublicVotingDnaRelationship[];
  results: V3PublicVotingDnaResult[];
};
