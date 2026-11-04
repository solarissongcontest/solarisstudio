import type { PublicCapabilityMigration } from "./v3-public-capability-registry";

/**
 * TG3 representative roster route, separate from the World landing,
 * organization profile, office term history, and country relationship routes
 * being developed by other workers.
 */
export const V3_TERRA_REPRESENTATIVE_PUBLIC_CAPABILITIES = [
  {
    id: "terra-world-representatives",
    sourceFeatureFlags: [],
    legacyRoutes: ["/world/organizations/:slug/representatives"],
    legacyComponents: [],
    backendOwners: ["world-representations", "world-organizations"],
    personas: ["anonymous", "fan", "member", "hod", "historical-participant"],
    authRequirement: "public",
    classification: "contextualize",
    targetArea: "explore",
    targetRoute: "/world/organizations/:slug/representatives",
    specificationStatus: "building",
    acceptanceScenarioId: "world.public-representatives-current-historical",
    migrationEvidence: "TG3 bounded and publication-gated official representation roster, stacked on System TG2 #1888. Exact-head migration/test certification pending.",
  },
] as const satisfies readonly PublicCapabilityMigration[];
