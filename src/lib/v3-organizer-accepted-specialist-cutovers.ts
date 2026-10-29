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
  "live-review-time-machine": {
    owner: "edition.read",
    route: "/admin/time-machine",
    kind: "bounded-historical-read",
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
  "workspace-command-assistant": {
    owner: "edition.read",
    route: "/admin/command-assistant",
    kind: "bounded-read-only-assistant",
  },
  "workspace-public-ux": {
    owner: "edition.read",
    route: "/admin/public-ux",
    kind: "privacy-bounded-read-only-telemetry",
  },
  "workspace-beta-3-feedback": {
    owner: "rollout.manage",
    route: "/admin/beta3-feedback",
    kind: "read-only-beta-feedback-analysis",
  },
  "workspace-beta-2-feedback": {
    owner: "rollout.manage",
    route: "/admin/beta2-feedback",
    kind: "read-only-beta-feedback-analysis",
  },
  "workspace-beta-1-archive": {
    owner: "rollout.manage",
    route: "/admin/beta1-feedback",
    kind: "closed-read-only-beta-archive",
  },
  "workspace-beta-coverage": {
    owner: "rollout.manage",
    route: "/admin/admin-beta-feedback",
    kind: "read-only-qa-evidence-matrix",
  },
} as const;

export const V3_ORGANIZER_ACCEPTED_SPECIALIST_EVIDENCE =
  "src/lib/v3-organizer-specialist-acceptance.contract.test.ts; src/lib/studio2-country-cockpit-integration.test.ts; src/lib/v3-confirmation-maintenance-hotfix.contract.test.ts; src/integrations/televoting/admin-data.functions.ts; src/lib/organisation-v5-voting-declaration-lifecycle.test.ts; src/lib/v3-s7-voting-declaration-edition-binding.contract.test.ts; supabase/migrations/20261018122500_v3_voting_declaration_expected_edition_scope.sql; src/integrations/jury-voting/jury-integrity-admin.server.ts; src/routes/_authenticated/admin/time-machine.tsx; src/routes/_authenticated/admin/command-assistant.tsx; src/routes/_authenticated/admin/public-ux.tsx; src/lib/public-ux-metrics.ts; src/routes/_authenticated/admin/beta3-feedback.tsx; src/routes/_authenticated/admin/beta2-feedback.tsx; src/routes/_authenticated/admin/beta1-feedback.tsx; src/components/admin/AdminQaCoveragePage.tsx; src/lib/studio2-eligibility-integration.test.ts; src/lib/studio2-media-assets.test.ts; src/lib/v3-organizer-cutover.contract.test.ts; src/lib/v3-organizer-control-context.contract.test.ts; src/lib/v3-organizer-confirmation-calendar.test.ts; .github/scripts/v3-confirmation-maintenance-edit-rehearsal.sh; .github/workflows/v3-confirmation-maintenance-edit-rehearsal.yml";
