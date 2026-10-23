import type { PublicCapabilityMigration } from "./v3-public-capability-registry";

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
    legacyRoutes: ["/countries", "/editions", "/shows", "/wiki"],
    legacyComponents: ["AppShell"],
    backendOwners: ["edition", "country-profile", "results", "public-ux"],
    personas: ["anonymous", "fan", "member", "hod", "historical-participant"],
    authRequirement: "public",
    classification: "merge",
    targetArea: "explore",
    targetRoute: "/explore",
    specificationStatus: "building",
    acceptanceScenarioId: "public.v3-deep-route-shell-continuity",
    migrationEvidence:
      "Installed-app route roots reuse their existing canonical content/data owners while V3AppShell owns navigation chrome; native V3 detail gates remain authoritative where already implemented.",
  },
] as const satisfies readonly PublicCapabilityMigration[];
