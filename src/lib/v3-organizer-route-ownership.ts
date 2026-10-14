export type V3OrganizerRouteOwnership = {
  routePattern: string;
  ownerLegacyId: string;
  rationale: string;
};

/**
 * Child/detail URLs that belong to an already-classified Organizer capability.
 * They are route ownership, not separate product capabilities. Keeping this
 * explicit lets the route scanner detect orphan URLs without inflating the
 * migration registry with one fake capability per detail screen.
 */
export const V3_ORGANIZER_ROUTE_OWNERSHIP = [
  {
    routePattern: "/admin/entries/*",
    ownerLegacyId: "current-edition-contest",
    rationale: "Entry review is a Contest workspace child route.",
  },
  {
    routePattern: "/admin/shows/*",
    ownerLegacyId: "current-edition-contest",
    rationale: "Show configuration is a Contest workspace child route.",
  },
  {
    routePattern: "/admin/lineup-sync/*",
    ownerLegacyId: "current-edition-contest",
    rationale: "Running order is a Contest workspace child route.",
  },
  {
    routePattern: "/admin/participant-status/*",
    ownerLegacyId: "current-edition-contest",
    rationale: "Participation status is a Contest/Delegations operational child route.",
  },
  {
    routePattern: "/admin/edition-theme/*",
    ownerLegacyId: "current-edition-broadcast",
    rationale: "Legacy Edition Theme redirects into the canonical Design/Broadcast workspace.",
  },
  {
    routePattern: "/admin/integrity-case/*",
    ownerLegacyId: "trust-investigations",
    rationale: "Case detail is owned by the Investigations capability.",
  },
  {
    routePattern: "/admin/integrity-resolution/*",
    ownerLegacyId: "trust-investigations",
    rationale: "Resolution detail is owned by the Investigations capability.",
  },
] as const satisfies readonly V3OrganizerRouteOwnership[];

/** Router/layout infrastructure, not independently user-visible capability. */
export const V3_ORGANIZER_NON_CAPABILITY_ROUTES = new Set(["/admin", "/admin/"]);
