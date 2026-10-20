import type { V3CountryExploreProjection } from "./v3-explore-entities";
import type {
  V3RelationshipDetailBundle,
  V3RelationshipSharedEdition,
} from "./v3-relationships";
import type { CountryRelationship, HeadToHead } from "./stats";

export type V3CompareCountry = V3CountryExploreProjection;

export type V3CompareBundle = {
  rolloutEditionSlug: string | null;
  shell: {
    editionLabel: string;
    phaseLabel: "Compare";
  };
  a: V3CompareCountry;
  b: V3CompareCountry;
  relationship: CountryRelationship;
  headToHead: HeadToHead;
  sharedEditions: V3RelationshipSharedEdition[];
  relationshipHref: string;
  generatedAt: string;
} | null;

export function buildV3CompareBundle(input: {
  a: V3CountryExploreProjection;
  b: V3CountryExploreProjection;
  relationship: Exclude<V3RelationshipDetailBundle, null>;
}): Exclude<V3CompareBundle, null> {
  const aCode = input.a.code.trim().toUpperCase();
  const bCode = input.b.code.trim().toUpperCase();
  const relationshipCodes = new Set([
    input.relationship.a.shortCode.trim().toUpperCase(),
    input.relationship.b.shortCode.trim().toUpperCase(),
  ]);

  if (!aCode || !bCode || aCode === bCode) {
    throw new Error("V3 Compare requires two distinct public countries.");
  }
  if (!relationshipCodes.has(aCode) || !relationshipCodes.has(bCode)) {
    throw new Error("V3 Compare relationship identity does not match the requested countries.");
  }

  return {
    rolloutEditionSlug: input.relationship.rolloutEditionSlug,
    shell: {
      editionLabel: input.relationship.shell.editionLabel,
      phaseLabel: "Compare",
    },
    a: input.a,
    b: input.b,
    relationship: input.relationship.relationship,
    headToHead: input.relationship.headToHead,
    sharedEditions: input.relationship.sharedEditions,
    relationshipHref: `/relationships/${encodeURIComponent(`${aCode}-VS-${bCode}`)}`,
    generatedAt: new Date().toISOString(),
  };
}
