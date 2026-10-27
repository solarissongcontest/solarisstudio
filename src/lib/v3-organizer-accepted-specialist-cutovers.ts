export const V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS = {
  "operations-eligibility": {
    owner: "delegation.read",
    route: "/admin/eligibility",
    kind: "governed-r2-eligibility-operations",
  },
  "operations-media-assets": {
    owner: "publishing.read",
    route: "/admin/media-assets",
    kind: "governed-media-review-operations",
  },
  "delegation-confirmation-overview": {
    owner: "confirmation.read",
    route: "/confirmations/admin",
    kind: "canonical-confirmation-workspace",
  },
  "delegation-confirmation-requirements": {
    owner: "confirmation.read",
    route: "/confirmations/admin/requirements",
    kind: "canonical-confirmation-requirements",
  },
  "delegation-settings": {
    owner: "confirmation.read",
    route: "/confirmations/admin/settings",
    kind: "canonical-confirmation-settings",
  },
} as const;

export const V3_ORGANIZER_ACCEPTED_SPECIALIST_EVIDENCE =
  "src/lib/v3-organizer-specialist-acceptance.contract.test.ts; src/lib/studio2-eligibility-integration.test.ts; src/lib/studio2-media-assets.test.ts; src/lib/v3-organizer-cutover.contract.test.ts; src/lib/v3-organizer-control-context.contract.test.ts; src/lib/v3-organizer-confirmation-calendar.test.ts; .github/scripts/v3-confirmation-maintenance-edit-rehearsal.sh; .github/workflows/v3-confirmation-maintenance-edit-rehearsal.yml";
