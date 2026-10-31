import type {
  PublicCapabilityMigration,
  PublicPersona,
} from "./v3-public-capability-registry";

const ALL_PUBLIC_PERSONAS = [
  "anonymous",
  "fan",
  "member",
  "hod",
  "historical-participant",
] as const satisfies readonly PublicPersona[];

/**
 * Canonical Public V3 capabilities that are new product work rather than
 * migrations discovered from a legacy route/surface scan.
 *
 * Keeping these separate prevents a new V3 capability from masquerading as a
 * legacy-route discovery merely to make the aggregate registry notice it.
 */
export const V3_PUBLIC_PLANNED_CAPABILITIES = [
  {
    id: "results.jury_share_card",
    sourceFeatureFlags: [],
    legacyRoutes: [],
    legacyComponents: [],
    backendOwners: ["results", "jury", "publication"],
    personas: ALL_PUBLIC_PERSONAS,
    authRequirement: "optional",
    classification: "contextualize",
    targetArea: "results",
    targetRoute: "/results/jury-share",
    specificationStatus: "building",
    acceptanceScenarioId: "public.jury-share-card-publication-safe",
    migrationEvidence:
      "Canonical Jury Share foundation is landed. System publication/authorization projection and the Public Results image consumer remain ordered implementation dependencies; parity is not claimed until those contracts are integrated and exact-head evidence is green.",
  },
] as const satisfies readonly PublicCapabilityMigration[];
