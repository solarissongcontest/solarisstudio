import type { SolarisCapability } from "./permissions-v2";

export type TerraGovernanceImplementationState =
  | "foundation"
  | "implemented"
  | "integrated"
  | "tested"
  | "certified";

export type TerraGovernanceDomainOwner = {
  id: string;
  wave: "TG1" | "TG2" | "TG4" | "TG3+";
  implementationState: TerraGovernanceImplementationState;
  canonicalOwner: string;
  canonicalTables: readonly string[];
  existingSolarisOwnersReused: readonly string[];
  commands: readonly string[];
  projections: readonly string[];
  eventTypes: readonly string[];
  capabilities: readonly SolarisCapability[];
  notes: readonly string[];
};

/**
 * Canonical machine-readable ownership for Terra Solaris Governance.
 * This supplements V3 System ownership and must never be interpreted as
 * permission to create duplicate current-country, Archive, task, notification
 * or capability systems.
 */
export const TERRA_GOVERNANCE_DOMAIN_REGISTRY: readonly TerraGovernanceDomainOwner[] = [
  {
    id: "world-country-control",
    wave: "TG1",
    implementationState: "foundation",
    canonicalOwner: "public.country_accounts for current control; world_country_control_terms for history",
    canonicalTables: ["public.country_accounts", "public.world_country_control_terms"],
    existingSolarisOwnersReused: [
      "public.country_accounts",
      "public.delegation_people",
      "public.delegation_hod_assignments",
      "public.country_hod_edition_claims",
    ],
    commands: ["world.country_control.bind_person"],
    projections: ["public.world_country_identity_v1"],
    eventTypes: ["world.country_control_linked"],
    capabilities: ["delegation.read", "delegation.manage"],
    notes: [
      "Current country authority is not duplicated.",
      "Historical identity survives auth-user deletion through delegation_people.",
      "Full controller transfer remains owned by a later governed country-account transition slice.",
    ],
  },
  {
    id: "world-organizations",
    wave: "TG2",
    implementationState: "foundation",
    canonicalOwner: "generic Terra Solaris organization and organ state",
    canonicalTables: ["public.world_organizations", "public.world_organization_organs"],
    existingSolarisOwnersReused: ["public.studio2_capabilities", "public.studio2_capability_grants"],
    commands: [],
    projections: ["public.world_organization_projection_v1"],
    eventTypes: [],
    capabilities: [
      "world.organization.view_private",
      "world.organization.profile.manage",
      "world.organization.branding.manage",
      "world.organization.settings.manage",
    ],
    notes: [
      "GUARD and UNITY are seed records in a generic model, not schema branches.",
      "Future recognized unions use the same organization primitive.",
    ],
  },
  {
    id: "world-memberships",
    wave: "TG2",
    implementationState: "foundation",
    canonicalOwner: "organization-country membership terms",
    canonicalTables: ["public.world_organization_memberships"],
    existingSolarisOwnersReused: ["public.countries", "public.country_accounts"],
    commands: [],
    projections: ["public.world_organization_projection_v1"],
    eventTypes: [],
    capabilities: [
      "world.membership.apply",
      "world.membership.review",
      "world.membership.introduce",
      "world.membership.execute_admission",
      "world.membership.withdraw",
      "world.membership.execute_expulsion",
      "world.membership.suspend",
    ],
    notes: [
      "Constitutional admission/withdrawal/expulsion workflows are intentionally not claimed complete by the TG2 schema foundation.",
      "Open membership is unique per organization and country.",
    ],
  },
  {
    id: "world-representation",
    wave: "TG2",
    implementationState: "foundation",
    canonicalOwner: "country representation and bounded proxy terms",
    canonicalTables: [
      "public.world_organization_representations",
      "public.world_representation_proxies",
    ],
    existingSolarisOwnersReused: ["public.delegation_people", "public.country_accounts"],
    commands: ["world.representation.assign"],
    projections: ["public.world_organization_projection_v1"],
    eventTypes: ["world.representation.changed"],
    capabilities: [
      "world.representation.manage",
      "world.proxy.request",
      "world.proxy.approve",
    ],
    notes: [
      "One current voting representative per organization and country.",
      "Proxy effectiveness is bounded by server time even before expiry materialization.",
    ],
  },
  {
    id: "world-offices",
    wave: "TG2",
    implementationState: "foundation",
    canonicalOwner: "organization offices and durable office terms",
    canonicalTables: ["public.world_organization_offices", "public.world_office_terms"],
    existingSolarisOwnersReused: ["public.delegation_people", "public.editions"],
    commands: [],
    projections: ["public.world_organization_projection_v1"],
    eventTypes: [],
    capabilities: [
      "world.office.manage",
      "world.office.term.assign",
      "world.office.term.transition",
    ],
    notes: [
      "Office terms use durable person identity and optional auth linkage.",
      "Default term length is per office; GUARD Chairperson and UNITY Secretary-General seed as two editions.",
    ],
  },
  {
    id: "world-authorization-scope",
    wave: "TG2",
    implementationState: "foundation",
    canonicalOwner: "Permission Engine V2 grants plus Terra Solaris object scope",
    canonicalTables: [
      "public.studio2_capabilities",
      "public.studio2_capability_grants",
      "public.world_capability_grant_scopes",
      "public.world_office_capabilities",
      "public.world_country_controller_capabilities",
    ],
    existingSolarisOwnersReused: [
      "public.studio2_capabilities",
      "public.studio2_capability_grants",
      "public.country_accounts",
    ],
    commands: [],
    projections: ["public.world_access_allowed"],
    eventTypes: [],
    capabilities: [
      "world.organization.view_private",
      "world.organization.profile.manage",
      "world.organization.branding.manage",
      "world.organization.settings.manage",
      "world.membership.apply",
      "world.membership.review",
      "world.membership.introduce",
      "world.membership.execute_admission",
      "world.membership.withdraw",
      "world.membership.execute_expulsion",
      "world.membership.suspend",
      "world.representation.manage",
      "world.proxy.request",
      "world.proxy.approve",
      "world.office.manage",
      "world.office.term.assign",
      "world.office.term.transition",
    ],
    notes: [
      "World scope extends the existing grant identity rather than replacing Permission Engine V2.",
      "Office-derived authority is capability data, never frontend title matching.",
    ],
  },
  {
    id: "world-documents",
    wave: "TG4",
    implementationState: "implemented",
    canonicalOwner: "generic institutional legal document Work/Version/Provision/Artifact state",
    canonicalTables: [
      "public.world_documents",
      "public.world_document_versions",
      "public.world_document_provisions",
      "public.world_document_version_provisions",
      "public.world_document_artifacts",
    ],
    existingSolarisOwnersReused: [
      "public.world_organizations",
      "public.world_access_allowed",
      "public.studio2_capabilities",
      "public.studio2_capability_grants",
      "public.studio2_operation_receipts",
      "private.v3_domain_events",
      "private.v3_domain_event_outbox",
      "private.v3_domain_event_consumer_receipts",
    ],
    commands: [
      "world.document.create",
      "world.document.version.create",
      "world.document.version.update_draft",
      "world.document.version.publish",
    ],
    projections: [
      "public.world_get_document_index_v1",
      "public.world_get_document_v1",
      "public.world_get_document_archive_v1",
    ],
    eventTypes: [
      "world.document.created",
      "world.document.version_created",
      "world.document.version_published",
      "world.document.version_superseded",
    ],
    capabilities: ["world.document.manage", "world.document.publish"],
    notes: [
      "Published legal text is immutable and superseded versions remain permanent.",
      "Provision semantic identity survives renumbering and relocation between versions.",
      "Artifacts are representations; the structured Version remains authoritative.",
      "Existing V3 Archive remains the historical owner; TG4 does not create a world_archive truth store.",
      "Full exact-head CI certification is deferred until the stacked PR is retargeted to main because repository workflows only trigger for main-targeting pull requests.",
    ],
  },
] as const;

export const TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS = [
  "20261102170500_v3_tg1_world_country_control_foundation.sql",
  "20261102171500_v3_tg2_world_institution_core.sql",
  "20261102171600_v3_tg2_world_institution_access.sql",
  "20261102171700_v3_tg2_world_office_term_canonical_alignment.sql",
  "20261102171800_v3_tg2_world_office_term_dependents.sql",
] as const;

export const TERRA_GOVERNANCE_FOUNDATION_EVENT_TYPES = [
  "world.country_control_linked",
  "world.representation.changed",
] as const;

export const TERRA_GOVERNANCE_TG4_MIGRATIONS = [
  "20261103163000_v3_tg4_world_document_state.sql",
  "20261103164000_v3_tg4_world_document_commands.sql",
  "20261103165000_v3_tg4_world_document_archive_projection.sql",
  "20261103165500_v3_tg4_world_document_hardening.sql",
  "20261103165700_v3_tg4_world_document_identity_scope.sql",
  "20261103165900_v3_tg4_world_document_hierarchy_integrity.sql",
] as const;

export const TERRA_GOVERNANCE_TG4_EVENT_TYPES = [
  "world.document.created",
  "world.document.version_created",
  "world.document.version_published",
  "world.document.version_superseded",
] as const;

export function terraGovernanceDomain(id: string) {
  return TERRA_GOVERNANCE_DOMAIN_REGISTRY.find((domain) => domain.id === id) ?? null;
}
