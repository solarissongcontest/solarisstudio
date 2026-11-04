import type { PublicCapabilityMigration } from "./v3-public-capability-registry";

/**
 * Public route registry for the TG2 world organizations feature.
 * Separate from the legacy Public route discovery registry to avoid colliding
 * with active Public capability-migration workers.
 */
export const V3_TERRA_WORLD_PUBLIC_CAPABILITIES = [
  {
    id: "terra-world-organizations",
    sourceFeatureFlags: [],
    legacyRoutes: ["/world/organizations", "/world/organizations/*"],
    legacyComponents: [],
    backendOwners: ["world-organizations", "world-memberships"],
    personas: ["anonymous", "fan", "member", "hod", "historical-participant"],
    authRequirement: "public",
    classification: "redesign",
    targetArea: "explore",
    targetRoute: "/world/organizations",
    specificationStatus: "building",
    acceptanceScenarioId: "public.world-organization-discovery-and-profile",
    migrationEvidence: "Wave 2 publication-safe TG2 public directory and institutional profile; upstream PR #1888 required for integration.",
  },
] as const satisfies readonly PublicCapabilityMigration[];
