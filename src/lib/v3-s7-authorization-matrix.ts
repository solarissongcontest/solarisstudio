import {
  SOLARIS_CAPABILITIES,
  type SolarisCapability,
} from "./permissions-v2";

export type V3AuthorizationOperationScope = "global" | "edition" | "either";

export type V3AuthorizationEffect =
  | "read"
  | "write"
  | "review"
  | "operate"
  | "transition"
  | "publish"
  | "sanction";

export type V3AuthorizationRiskTier = 1 | 2 | 3 | 4;

export type V3AuthorizationObjectType =
  | "edition"
  | "country"
  | "delegation"
  | "confirmation"
  | "entry"
  | "show"
  | "voting_configuration"
  | "jury_ballot"
  | "televote_ballot"
  | "result"
  | "incident"
  | "communication"
  | "audience"
  | "rule"
  | "integrity_case"
  | "publication"
  | "broadcast"
  | "system"
  | "community_case"
  | "feature_rollout"
  | "permission_assignment"
  | "governance_motion"
  | "host"
  | "story";

export type V3AuthorizationMatrixRow = {
  capability: SolarisCapability;
  domain: string;
  operationScope: V3AuthorizationOperationScope;
  objectTypes: readonly V3AuthorizationObjectType[];
  effect: V3AuthorizationEffect;
  riskTier: V3AuthorizationRiskTier;
  serverAuthoritativeMutationRequired: boolean;
  domainSafeguards: readonly string[];
};

type AuthorizationFamily = {
  prefix: string;
  domain: string;
  operationScope: V3AuthorizationOperationScope;
  objectTypes: readonly V3AuthorizationObjectType[];
  domainSafeguards: readonly string[];
};

/**
 * S7 authorization policy families.
 *
 * This is verification metadata, not a second permission engine. Runtime access
 * remains authoritative in Permission Engine V2 / RLS / guarded server RPCs.
 * The matrix exists so every capability must declare the object family and
 * context in which that existing authority is expected to be evaluated.
 */
const AUTHORIZATION_FAMILIES: readonly AuthorizationFamily[] = [
  {
    prefix: "edition.",
    domain: "edition",
    operationScope: "edition",
    objectTypes: ["edition"],
    domainSafeguards: ["edition lifecycle", "edition scope"],
  },
  {
    prefix: "delegation.",
    domain: "delegation",
    operationScope: "edition",
    objectTypes: ["delegation", "country"],
    domainSafeguards: ["edition scope", "country/delegation ownership where applicable"],
  },
  {
    prefix: "confirmation.",
    domain: "confirmation",
    operationScope: "edition",
    objectTypes: ["confirmation", "delegation", "country"],
    domainSafeguards: ["edition scope", "confirmation workflow state", "delegation ownership"],
  },
  {
    prefix: "entry.",
    domain: "entry",
    operationScope: "edition",
    objectTypes: ["entry", "delegation", "country"],
    domainSafeguards: ["edition scope", "entry ownership", "entry workflow/publication state"],
  },
  {
    prefix: "voting.",
    domain: "voting",
    operationScope: "edition",
    objectTypes: ["voting_configuration", "show"],
    domainSafeguards: ["edition scope", "show/voting lifecycle"],
  },
  {
    prefix: "jury.ballots.",
    domain: "jury",
    operationScope: "edition",
    objectTypes: ["jury_ballot", "show", "delegation"],
    domainSafeguards: ["edition scope", "jury round state", "ballot ownership/integrity"],
  },
  {
    prefix: "televote.ballots.",
    domain: "televote",
    operationScope: "edition",
    objectTypes: ["televote_ballot", "show"],
    domainSafeguards: ["edition scope", "televote round state", "vote integrity"],
  },
  {
    prefix: "results.",
    domain: "results",
    operationScope: "edition",
    objectTypes: ["result", "show"],
    domainSafeguards: ["edition scope", "result version/review state", "publication state"],
  },
  {
    prefix: "incident.",
    domain: "incident",
    operationScope: "edition",
    objectTypes: ["incident"],
    domainSafeguards: ["edition scope", "incident lifecycle"],
  },
  {
    prefix: "communications.",
    domain: "communications",
    operationScope: "edition",
    objectTypes: ["communication", "audience"],
    domainSafeguards: ["edition scope", "audience eligibility", "delivery/publication state"],
  },
  {
    prefix: "rules.",
    domain: "rules",
    operationScope: "either",
    objectTypes: ["rule", "edition"],
    domainSafeguards: ["rulebook validation", "effective-version state", "governance where required"],
  },
  {
    prefix: "integrity.",
    domain: "integrity",
    operationScope: "edition",
    objectTypes: ["integrity_case", "show"],
    domainSafeguards: ["edition scope", "evidence visibility", "appeal/sanction safeguards"],
  },
  {
    prefix: "publishing.",
    domain: "publication",
    operationScope: "edition",
    objectTypes: ["publication", "edition"],
    domainSafeguards: ["edition scope", "canonical publication state", "publication policy"],
  },
  {
    prefix: "broadcast.",
    domain: "broadcast",
    operationScope: "edition",
    objectTypes: ["broadcast", "show"],
    domainSafeguards: ["edition scope", "show/runtime state"],
  },
  {
    prefix: "system.",
    domain: "system",
    operationScope: "global",
    objectTypes: ["system"],
    domainSafeguards: ["platform scope", "service-role boundary where required"],
  },
  {
    prefix: "community.",
    domain: "community",
    operationScope: "either",
    objectTypes: ["community_case"],
    domainSafeguards: ["subject visibility", "moderation lifecycle"],
  },
  {
    prefix: "rollout.",
    domain: "feature-rollout",
    operationScope: "either",
    objectTypes: ["feature_rollout", "edition"],
    domainSafeguards: ["rollout dependency graph", "requested/effective scope"],
  },
  {
    prefix: "permissions.",
    domain: "permissions",
    operationScope: "either",
    objectTypes: ["permission_assignment", "edition"],
    domainSafeguards: ["target scope", "grant expiry", "permission administration audit"],
  },
  {
    prefix: "governance.",
    domain: "governance",
    operationScope: "global",
    objectTypes: ["governance_motion"],
    domainSafeguards: ["governance eligibility", "motion/vote lifecycle"],
  },
  {
    prefix: "host.",
    domain: "host",
    operationScope: "edition",
    objectTypes: ["host", "edition"],
    domainSafeguards: ["edition scope", "host workflow state"],
  },
  {
    prefix: "story.",
    domain: "story",
    operationScope: "edition",
    objectTypes: ["story", "edition"],
    domainSafeguards: ["edition scope", "story/publication state"],
  },
] as const;

const CRITICAL_EFFECT_CAPABILITIES = new Set<SolarisCapability>([
  "edition.archive",
  "results.publish",
  "integrity.sanction",
  "publishing.publish",
  "system.manage",
  "permissions.manage",
]);

function familyFor(capability: SolarisCapability): AuthorizationFamily {
  const matches = AUTHORIZATION_FAMILIES.filter((family) =>
    capability.startsWith(family.prefix),
  );
  if (matches.length !== 1) {
    throw new Error(
      `S7 authorization family coverage must resolve exactly once for ${capability}; got ${matches.length}`,
    );
  }
  return matches[0]!;
}

function effectFor(capability: SolarisCapability): V3AuthorizationEffect {
  if (
    capability.endsWith(".read") ||
    capability.endsWith(".read_private") ||
    capability.endsWith(".preview") ||
    capability.endsWith(".audit")
  ) {
    return "read";
  }
  if (
    capability.endsWith(".verify") ||
    capability.endsWith(".approve")
  ) {
    return "review";
  }
  if (
    capability.endsWith(".publish") ||
    capability.endsWith(".archive")
  ) {
    return "publish";
  }
  if (capability.endsWith(".sanction")) return "sanction";
  if (
    capability.endsWith(".transition") ||
    capability.endsWith(".resolve")
  ) {
    return "transition";
  }
  if (
    capability.endsWith(".control") ||
    capability.endsWith(".send") ||
    capability.endsWith(".vote") ||
    capability.endsWith(".moderate")
  ) {
    return "operate";
  }
  return "write";
}

function riskFor(
  capability: SolarisCapability,
  effect: V3AuthorizationEffect,
): V3AuthorizationRiskTier {
  if (CRITICAL_EFFECT_CAPABILITIES.has(capability)) return 4;
  if (effect === "read") return 1;
  if (effect === "review" || effect === "write") return 2;
  return 3;
}

function buildAuthorizationMatrixRow(
  capability: SolarisCapability,
): V3AuthorizationMatrixRow {
  const family = familyFor(capability);
  const effect = effectFor(capability);
  return {
    capability,
    domain: family.domain,
    operationScope: family.operationScope,
    objectTypes: family.objectTypes,
    effect,
    riskTier: riskFor(capability, effect),
    serverAuthoritativeMutationRequired: effect !== "read",
    domainSafeguards: family.domainSafeguards,
  };
}

/**
 * Generated from the canonical capability catalog. Adding a capability without
 * an S7 family policy fails module/test evaluation instead of silently creating
 * an authorization hole in the verification matrix.
 */
export const V3_S7_AUTHORIZATION_MATRIX: readonly V3AuthorizationMatrixRow[] =
  SOLARIS_CAPABILITIES.map(buildAuthorizationMatrixRow);

const V3_S7_AUTHORIZATION_BY_CAPABILITY = new Map(
  V3_S7_AUTHORIZATION_MATRIX.map((row) => [row.capability, row] as const),
);

export function authorizationPolicyForCapability(
  capability: SolarisCapability,
): V3AuthorizationMatrixRow {
  const row = V3_S7_AUTHORIZATION_BY_CAPABILITY.get(capability);
  if (!row) throw new Error(`Missing S7 authorization policy for ${capability}`);
  return row;
}
