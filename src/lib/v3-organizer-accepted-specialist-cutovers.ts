export const V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS = {
  "current-edition-delegations": {
    owner: "delegation.read",
    route: "/admin/countries",
    kind: "exact-edition-country-cockpit",
  },
  "current-edition-voting": {
    owner: "voting.read",
    route: "/televoting/admin",
    kind: "exact-edition-voting-overview",
  },
  "current-edition-voting-declarations": {
    owner: "voting.read",
    route: "/televoting/admin/integrity-declarations",
    kind: "edition-bound-governed-declaration-evidence",
  },
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
  "voting-jury-integrity": {
    owner: "voting.read",
    route: "/admin/jury-integrity",
    kind: "bounded-exact-edition-integrity-evidence",
  },
} as const;

export const V3_ORGANIZER_ACCEPTED_SPECIALIST_EVIDENCE =
  "src/lib/v3-organizer-specialist-acceptance.contract.test.ts; src/lib/studio2-country-cockpit-integration.test.ts; src/lib/v3-confirmation-maintenance-hotfix.contract.test.ts; src/integrations/televoting/admin-data.functions.ts; src/lib/organisation-v5-voting-declaration-lifecycle.test.ts; src/lib/v3-s7-voting-declaration-edition-binding.contract.test.ts; supabase/migrations/20261018122500_v3_voting_declaration_expected_edition_scope.sql; src/integrations/jury-voting/jury-integrity-admin.server.ts; src/lib/studio2-eligibility-integration.test.ts; src/lib/studio2-media-assets.test.ts; src/lib/v3-organizer-cutover.contract.test.ts; src/lib/v3-organizer-control-context.contract.test.ts; src/lib/v3-organizer-confirmation-calendar.test.ts; .github/scripts/v3-confirmation-maintenance-edit-rehearsal.sh; .github/workflows/v3-confirmation-maintenance-edit-rehearsal.yml";
