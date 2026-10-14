import type { AdminCapabilityMigration } from "./v3-organizer-capability-registry";

/**
 * Organizer capabilities that exist as real routes/workspaces but are not
 * listed as independent items in the specialist-directory navigation.
 *
 * These rows prevent hidden deep links, redirects and contextual workspaces
 * from escaping V3 migration ownership merely because they are not permanent
 * navigation destinations.
 */
export const V3_ORGANIZER_ROUTE_CAPABILITY_REGISTRY = [
  {
    legacyId: "route-organizer-root",
    legacyRoutes: ["/admin", "/admin/"],
    classification: "redesign",
    targetDomain: "overview",
    targetRoute: "/admin/operations",
    ownerCapability: "edition.read",
    migrationStatus: "parity",
  },
  {
    legacyId: "route-entry-review-workspace",
    legacyRoutes: ["/admin/entries/*"],
    classification: "merge",
    targetDomain: "contest",
    targetRoute: "/admin/control",
    ownerCapability: "entry.review",
    migrationStatus: "building",
  },
  {
    legacyId: "route-contest-edition-workspaces",
    legacyRoutes: [
      "/admin/shows/*",
      "/admin/lineup-sync/*",
      "/admin/participant-status/*",
    ],
    classification: "merge",
    targetDomain: "contest",
    targetRoute: "/admin/control",
    ownerCapability: "edition.read",
    migrationStatus: "building",
  },
  {
    legacyId: "route-edition-theme-legacy",
    legacyRoutes: ["/admin/edition-theme/*"],
    classification: "merge",
    targetDomain: "contest",
    targetRoute: "/admin/design/:editionSlug",
    ownerCapability: "edition.manage",
    migrationStatus: "parity",
  },
  {
    legacyId: "route-integrity-case-workspace",
    legacyRoutes: [
      "/admin/integrity-case/*",
      "/admin/integrity-resolution/*",
    ],
    classification: "contextualize",
    targetDomain: "governance",
    targetRoute: "/admin/integrity-investigations",
    ownerCapability: "integrity.read",
    migrationStatus: "building",
  },
] as const satisfies readonly AdminCapabilityMigration[];
