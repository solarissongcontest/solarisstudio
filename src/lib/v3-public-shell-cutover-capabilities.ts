import type { PublicCapabilityMigration } from "./v3-public-capability-registry";

const ALL_PUBLIC_PERSONAS = [
  "anonymous",
  "fan",
  "member",
  "hod",
  "historical-participant",
] as const;

/**
 * Route-root ownership introduced by the V3 shell cutover.
 *
 * The corresponding detail families were already registered through wildcard
 * routes. TanStack parent layout routes are concrete production routes too, so
 * the capability guard correctly requires their exact roots to have explicit
 * ownership rather than relying on an accidental wildcard interpretation.
 */
export const V3_PUBLIC_SHELL_CUTOVER_CAPABILITIES = [
  {
    id: "explore-directory-roots",
    sourceFeatureFlags: [],
    legacyRoutes: ["/countries", "/editions", "/shows", "/wiki", "/tools", "/guide"],
    legacyComponents: ["AppShell"],
    backendOwners: ["edition", "country-profile", "results", "public-ux"],
    personas: ALL_PUBLIC_PERSONAS,
    authRequirement: "public",
    classification: "merge",
    targetArea: "explore",
    targetRoute: "/explore",
    specificationStatus: "building",
    acceptanceScenarioId: "public.v3-deep-route-shell-continuity",
    migrationEvidence:
      "Installed-app discovery route roots reuse their existing canonical content/data owners while V3AppShell owns navigation chrome; native V3 detail gates remain authoritative where already implemented.",
  },
  {
    id: "results-analysis-roots",
    sourceFeatureFlags: [],
    legacyRoutes: ["/analysis", "/compare", "/voting-dna"],
    legacyComponents: ["AppShell"],
    backendOwners: ["results", "publication"],
    personas: ALL_PUBLIC_PERSONAS,
    authRequirement: "public",
    classification: "merge",
    targetArea: "results",
    targetRoute: "/results",
    specificationStatus: "building",
    acceptanceScenarioId: "public.v3-results-analysis-shell-continuity",
    migrationEvidence:
      "Installed-app analysis roots retain canonical published-result authorities while V3AppShell owns Results navigation continuity and independent Results rollout rollback.",
  },
] as const satisfies readonly PublicCapabilityMigration[];
