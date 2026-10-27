import { V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS, V3_ORGANIZER_ACCEPTED_SPECIALIST_EVIDENCE } from "./v3-organizer-accepted-specialist-cutovers";
import { V3_ORGANIZER_OBSERVATIONAL_CUTOVERS, V3_ORGANIZER_OBSERVATIONAL_EVIDENCE } from "./v3-organizer-observational-cutovers";
import { buildAdminNavigation } from "@/components/admin/admin-navigation";
import { capabilityForOrganizerPath } from "./permission-route-map";
import type { SolarisFeatureFlag } from "./feature-flags";
import { v3OrganizerTabForPath, v3OrganizerTabRoot } from "./v3-organizer";
import type { V3MigrationClassification } from "./v3-public-capability-registry";

export type AdminCapabilityMigration = {
  legacyId: string;
  legacyRoutes: readonly string[];
  classification: V3MigrationClassification;
  targetDomain: string;
  targetRoute: string;
  ownerCapability: string;
  migrationStatus: "planned" | "building" | "parity" | "cutover" | "retired";
  migrationEvidence?: string;
};

/**
 * Explicit decisions for every item in the canonical Organizer specialist
 * directory. The registry guard compares this object with buildAdminNavigation
 * so a newly-added Organizer capability cannot quietly skip V3 classification.
 */
export const V3_ORGANIZER_CLASSIFICATION_BY_ID = {
  "current-edition-overview": "redesign",
  "current-edition-tasks": "redesign",
  "current-edition-delegations": "merge",
  "current-edition-contest": "merge",
  "current-edition-host": "contextualize",
  "current-edition-voting": "merge",
  "current-edition-voting-declarations": "contextualize",
  "current-edition-results": "redesign",
  "current-edition-storytelling": "contextualize",
  "current-edition-publish": "redesign",
  "current-edition-broadcast": "merge",
  "operations-control-room": "redesign",
  "operations-workflows": "contextualize",
  "operations-incidents": "redesign",
  "operations-eligibility": "merge",
  "operations-media-assets": "merge",
  "operations-communications": "redesign",
  "live-review-reveal-director": "contextualize",
  "live-review-broadcast-rundown": "redesign",
  "live-review-simulation-lab": "contextualize",
  "live-review-time-machine": "contextualize",
  "live-review-voting-lab": "contextualize",
  "delegation-confirmation-overview": "merge",
  "delegation-confirmation-requirements": "merge",
  "delegation-confirmation-responses": "merge",
  "delegation-next-in-line": "contextualize",
  "delegation-responses-by-country": "merge",
  "delegation-submission-rounds": "merge",
  "delegation-calendar": "merge",
  "delegation-access": "restrict",
  "delegation-submission-history": "contextualize",
  "delegation-edition-links": "restrict",
  "delegation-sync": "restrict",
  "delegation-settings": "restrict",
  "voting-rounds-entries": "merge",
  "voting-jury": "redesign",
  "voting-rules": "merge",
  "voting-jury-integrity": "restrict",
  "voting-televote-totals": "merge",
  "voting-integrity-review": "restrict",
  "voting-public-results": "merge",
  "voting-intelligence": "contextualize",
  "voting-analytics": "contextualize",
  "voting-combined-results": "contextualize",
  "voting-result-integrity": "restrict",
  "voting-audit-log": "restrict",
  "voting-edition-links": "restrict",
  "voting-result-backtest": "contextualize",
  "voting-anti-abuse": "restrict",
  "trust-investigations": "redesign",
  "trust-rule-rulings": "merge",
  "trust-appeals": "redesign",
  "trust-evidence": "restrict",
  "trust-disclosure": "restrict",
  "trust-identity-access": "restrict",
  "trust-rules-manager": "redesign",
  "trust-interpretations": "merge",
  "trust-public-rules": "merge",
  "workspace-access-permissions": "restrict",
  "workspace-administration": "contextualize",
  "workspace-feature-rollout": "restrict",
  "workspace-all-editions": "contextualize",
  "workspace-organizer-guide": "contextualize",
  "workspace-country-accounts": "restrict",
  "workspace-flag-qa": "restrict",
  "workspace-hod-history": "contextualize",
  "workspace-community-moderation": "restrict",
  "workspace-predictions": "contextualize",
  "workspace-fantasy": "contextualize",
  "workspace-command-assistant": "contextualize",
  "workspace-anniversary-settings": "contextualize",
  "workspace-anniversary-dates": "contextualize",
  "workspace-public-ux": "restrict",
  "workspace-beta-3-feedback": "contextualize",
  "workspace-beta-2-feedback": "contextualize",
  "workspace-beta-1-archive": "contextualize",
  "workspace-acceptance-test": "restrict",
  "workspace-beta-coverage": "restrict",
  "workspace-system-health": "redesign",
  "workspace-delivery-jobs": "restrict",
  "workspace-system-settings": "restrict",
} as const satisfies Record<string, V3MigrationClassification>;

function canonicalLegacyRoute(route: string) {
  return route.replaceAll("__edition__", ":editionSlug");
}

function targetDomainFor(id: string) {
  if (/simulation-lab|time-machine|voting-lab|command-assistant/.test(id)) {
    return "specialist-labs";
  }
  if (/storytelling|anniversary|predictions|fantasy|community-moderation/.test(id)) {
    return "engagement-editorial";
  }
  if (/beta-|acceptance-test|beta-coverage|public-ux|flag-qa/.test(id)) {
    return "product-qa";
  }
  if (id === "current-edition-broadcast") return "production";
  if (/eligibility/.test(id)) return "contest";
  if (/confirmation|delegation|country|hod|next-in-line|submission/.test(id)) {
    return "delegations";
  }
  if (/jury|voting|televote|result|publish/.test(id)) return "voting-results";
  if (/trust|integrity|rules/.test(id)) return "governance";
  if (/broadcast|reveal|control-room|incident/.test(id)) return "live-production";
  if (/communication/.test(id)) return "communications";
  if (/media|contest|host/.test(id)) return "contest";
  if (/task|workflow/.test(id)) return "tasks-operations";
  if (/overview/.test(id)) return "overview";
  return "platform";
}

function migrationStatusFor(id: string): AdminCapabilityMigration["migrationStatus"] {
  if (
    id === "current-edition-overview" ||
    id === "voting-intelligence" ||
    id === "voting-analytics" ||
    id === "voting-audit-log" ||
    id === "voting-result-backtest" ||
    id === "voting-anti-abuse" ||
    id === "live-review-simulation-lab" ||
    id === "live-review-voting-lab" ||
    id === "workspace-administration" ||
    id === "workspace-organizer-guide" ||
    id === "delegation-edition-links" ||
    id === "delegation-calendar" ||
    Object.hasOwn(V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS, id)
  ) {
    return "cutover";
  }
  if (
    id === "current-edition-tasks" ||
    id === "operations-control-room" ||
    id === "operations-workflows" ||
    id === "operations-incidents" ||
    id === "current-edition-delegations" ||
    id === "current-edition-contest" ||
    id === "current-edition-host" ||
    id === "current-edition-voting" ||
    id === "current-edition-voting-declarations" ||
    id === "current-edition-results" ||
    id === "current-edition-storytelling" ||
    id === "current-edition-publish" ||
    id === "current-edition-broadcast" ||
    id === "operations-eligibility" ||
    id === "operations-media-assets" ||
    id === "operations-communications" ||
    id === "live-review-reveal-director" ||
    id === "live-review-broadcast-rundown" ||
    id === "live-review-time-machine" ||
    id === "delegation-confirmation-overview" ||
    id === "delegation-confirmation-requirements" ||
    id === "delegation-confirmation-responses" ||
    id === "delegation-next-in-line" ||
    id === "delegation-responses-by-country" ||
    id === "delegation-submission-rounds" ||
    id === "delegation-access" ||
    id === "delegation-submission-history" ||
    id === "delegation-sync" ||
    id === "delegation-settings" ||
    id === "voting-rounds-entries" ||
    id === "voting-jury" ||
    id === "voting-rules" ||
    id === "voting-jury-integrity" ||
    id === "voting-televote-totals" ||
    id === "voting-integrity-review" ||
    id === "voting-public-results" ||
    id === "voting-combined-results" ||
    id === "voting-result-integrity" ||
    id === "voting-edition-links" ||
    id === "trust-investigations" ||
    id === "trust-rule-rulings" ||
    id === "trust-appeals" ||
    id === "trust-evidence" ||
    id === "trust-disclosure" ||
    id === "trust-identity-access" ||
    id === "trust-rules-manager" ||
    id === "trust-interpretations" ||
    id === "trust-public-rules" ||
    id === "workspace-access-permissions" ||
    id === "workspace-feature-rollout" ||
    id === "workspace-all-editions" ||
    id === "workspace-country-accounts" ||
    id === "workspace-flag-qa" ||
    id === "workspace-hod-history" ||
    id === "workspace-acceptance-test" ||
    id === "workspace-beta-coverage" ||
    id === "workspace-public-ux" ||
    id === "workspace-community-moderation" ||
    id === "workspace-predictions" ||
    id === "workspace-fantasy" ||
    id === "workspace-command-assistant" ||
    id === "workspace-anniversary-settings" ||
    id === "workspace-anniversary-dates" ||
    id === "workspace-beta-3-feedback" ||
    id === "workspace-beta-2-feedback" ||
    id === "workspace-beta-1-archive" ||
    id === "workspace-system-health" ||
    id === "workspace-delivery-jobs" ||
    id === "workspace-system-settings"
  ) {
    return "building";
  }
  return "planned";
}

function targetRouteFor(route: string, classification: V3MigrationClassification) {
  const canonical = canonicalLegacyRoute(route);
  if (classification === "contextualize" || classification === "restrict") return canonical;
  return v3OrganizerTabRoot(v3OrganizerTabForPath(route));
}

const discoveredOrganizerItems = buildAdminNavigation("__edition__").flatMap((group) => group.items);

function organizerClassificationFor(id: string): V3MigrationClassification | null {
  if (!Object.hasOwn(V3_ORGANIZER_CLASSIFICATION_BY_ID, id)) return null;
  return V3_ORGANIZER_CLASSIFICATION_BY_ID[
    id as keyof typeof V3_ORGANIZER_CLASSIFICATION_BY_ID
  ];
}

export const V3_ORGANIZER_CAPABILITY_REGISTRY: readonly AdminCapabilityMigration[] =
  discoveredOrganizerItems.flatMap((item) => {
    if (item.availability !== "ready") return [];
    const classification = organizerClassificationFor(item.id);
    if (!classification) return [];
    const ownerCapability = capabilityForOrganizerPath(item.to) ?? "edition.read";
    return [
      {
        legacyId: item.id,
        legacyRoutes: [canonicalLegacyRoute(item.to)],
        classification,
        targetDomain: targetDomainFor(item.id),
        targetRoute: targetRouteFor(item.to, classification),
        ownerCapability,
        migrationStatus: migrationStatusFor(item.id),
        ...(item.id === "delegation-calendar" ? {
          migrationEvidence: "src/lib/v3-organizer-confirmation-calendar.ts; src/lib/v3-organizer-confirmation-calendar.test.ts; scripts/fixtures/v3-organizer-confirmation-calendar-proof.tsx; src/routes/confirmations/admin/calendar.tsx; supabase/migrations/20261017201000_confirmation_maintenance_postgrest_path_and_reads.sql; .github/scripts/v3-confirmation-maintenance-edit-rehearsal.sh; .github/workflows/v3-confirmation-maintenance-edit-rehearsal.yml",
        } : {}),
        ...(item.id === "delegation-edition-links" ? {
          migrationEvidence: "src/lib/v3-organizer-edition-links-explicit-mutations.contract.test.ts; src/integrations/confirmations/edition-bindings.ts; src/routes/confirmations/admin/editions.tsx; supabase/migrations/20261026210600_v3_confirmation_edition_binding_r3_fresh_auth.sql; supabase/migrations/20261027055547_reconcile_binding_idempotency_alias.sql; supabase/migrations/20261027110823_binding_version_conflict_http_contract.sql; .github/scripts/v3-confirmation-edition-binding-rehearsal.sh; .github/workflows/v3-confirmation-edition-binding-rehearsal.yml",
        } : {}),
        ...(Object.hasOwn(V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS, item.id)
          ? { migrationEvidence: V3_ORGANIZER_ACCEPTED_SPECIALIST_EVIDENCE } : {}),
        ...(Object.hasOwn(V3_ORGANIZER_OBSERVATIONAL_CUTOVERS, item.id)
          ? { migrationEvidence: V3_ORGANIZER_OBSERVATIONAL_EVIDENCE } : {}),
      },
    ];
  });

export const V3_ORGANIZER_DISCOVERED_IDS = new Set(discoveredOrganizerItems.map((item) => item.id));

export const V3_ORGANIZER_FEATURE_FLAGS = new Set<SolarisFeatureFlag>([
  "solaris_app_v3_organizer",
]);
