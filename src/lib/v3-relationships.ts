import type { PublicResultCoverage } from "./v3-public-result-snapshots";
import type { CountryRelationship, HeadToHead } from "./stats";

export type V3RelationshipCountry = {
  id: string;
  name: string;
  shortCode: string;
  flagImage: string | null;
  accentColor: string;
};

export type V3RelationshipPairSummary = {
  key: string;
  pairParam: string;
  a: V3RelationshipCountry;
  b: V3RelationshipCountry;
  sharedEditions: number;
  friendshipScore: number;
  rivalryScore: number;
  reciprocityScore: number;
  normalizedAtoB: number;
  normalizedBtoA: number;
  oneSidedGap: number;
};

export type V3RelationshipsIndexBundle = {
  rolloutEditionSlug: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  pairs: V3RelationshipPairSummary[];
  resultCoverage?: PublicResultCoverage;
  generatedAt: string;
};

export type V3RelationshipSharedEdition = {
  id: string;
  slug: string;
  label: string;
  editionNumber: number | null;
};

export type V3RelationshipDetailBundle = {
  rolloutEditionSlug: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  a: V3RelationshipCountry;
  b: V3RelationshipCountry;
  relationship: CountryRelationship;
  headToHead: HeadToHead;
  sharedEditions: V3RelationshipSharedEdition[];
  resultCoverage?: PublicResultCoverage;
  generatedAt: string;
} | null;
