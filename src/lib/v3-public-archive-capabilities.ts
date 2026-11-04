import type { PublicCapabilityMigration, PublicPersona } from "./v3-public-capability-registry";

const ALL_PUBLIC_PERSONAS = [
  "anonymous",
  "fan",
  "member",
  "hod",
  "historical-participant",
] as const satisfies readonly PublicPersona[];

/**
 * Net-new V3 Archive ownership that is not a legacy V6 feature surface.
 *
 * Keeping this separate from the route-discovered supplement avoids turning a
 * canonical V3 destination into a fictional legacy capability while still
 * giving route guards one explicit owner.
 */
export const V3_PUBLIC_ARCHIVE_CAPABILITIES = [
  {
    id: "archive-root",
    sourceFeatureFlags: [],
    legacyRoutes: ["/archive", "/archive/*"],
    legacyComponents: [],
    backendOwners: ["edition", "country-profile", "story", "results", "publication"],
    personas: ALL_PUBLIC_PERSONAS,
    authRequirement: "public",
    classification: "merge",
    targetArea: "explore",
    targetRoute: "/archive",
    specificationStatus: "building",
    acceptanceScenarioId: "public.archive-historical-context-root",
    migrationEvidence:
      "P34 Archive root provides a zero-authority historical hub over retained public destinations. Child publication and authorization remain canonical to their owning surfaces; cross-child historical context lock is not yet claimed as parity.",
  },
] as const satisfies readonly PublicCapabilityMigration[];
