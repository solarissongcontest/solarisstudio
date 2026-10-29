import { proveInternalMechanisms } from "./v3-s16-internal-mechanisms";
export const V3_S16_POLICY_VERSION = "v3-s16-mutation-authority-7" as const;

export type V3S16Risk = "integrity_critical" | "security_critical";

export type V3S16CompatibilityApplicationWriter = {
  path: string;
  table: string;
  ownerDomain: string;
  columns: readonly string[];
  reason: string;
  sunsetCondition: string;
};

export type V3S16CrossDomainWriter = {
  functionName: string;
  ownerDomain: string;
  scope: string;
  reason: string;
};

export type V3S16AllowedColumnGrant = {
  table: string;
  role: string;
  privilege: "INSERT" | "UPDATE";
  column: string;
  ownerDomain: string;
  sunsetCondition: string;
};

export type V3S16DomainDefinition = {
  id: string;
  risk: V3S16Risk;
  canonicalTables: readonly string[];
  canonicalOwner: string;
  canonicalCommands: readonly string[];
  sanctionedInternalWriters?: readonly string[];
  sanctionedCrossDomainWriters?: readonly V3S16CrossDomainWriter[];
  sanctionedWriteTriggers?: readonly string[];
  temporaryCompatibilityApplicationWriters?: readonly V3S16CompatibilityApplicationWriter[];
  allowedColumnDmlGrants?: readonly V3S16AllowedColumnGrant[];
  resultsFrozenOwner?: boolean;
  knownLegacyWriterPatterns?: readonly { id: string; pattern: RegExp }[];
};

export type V3S16SourceFile = { path: string; source: string };

export type V3S16CatalogColumnDmlGrant = {
  role: string;
  privilege: string;
  column: string;
};

export type V3S16CatalogTableEvidence = {
  table: string;
  owner: string | null;
  rlsEnabled: boolean | null;
  dmlRoles: readonly string[];
  /** Legacy aggregate evidence retained for backwards-compatible report parsing. */
  columnDmlRoles?: readonly string[];
  /** Exact column grants are required to prove bounded compatibility safely. */
  columnDmlGrants?: readonly V3S16CatalogColumnDmlGrant[];
  writeTriggers?: readonly string[];
  triggerDefinitions?: readonly { name: string; functionSignature: string; functionOid: string; type: number; enabled: string }[];
  updatableViews?: readonly string[];
};

export type V3S16CatalogFunctionEvidence = {
  name: string;
  owner: string | null;
  securityDefiner: boolean;
  searchPath: string | null;
  executeRoles: readonly string[];
  writesTables?: readonly string[];
  oid?: string;
  signature?: string;
  definitionHash?: string;
  returnType?: string;
  callers?: readonly string[];
};

export type V3S16CatalogEvidence = {
  schemaVersion: 1;
  candidateSha: string;
  tables: readonly V3S16CatalogTableEvidence[];
  functions: readonly V3S16CatalogFunctionEvidence[];
};

export type V3S16FindingKind =
  | "direct_application_writer"
  | "competing_legacy_writer"
  | "missing_canonical_command_definition"
  | "catalog_evidence_missing"
  | "catalog_table_missing"
  | "unexpected_direct_dml_role"
  | "unexpected_column_dml_role"
  | "column_dml_scope_unproven"
  | "rls_not_enabled"
  | "unexpected_write_trigger"
  | "unexpected_updatable_view"
  | "canonical_function_missing"
  | "canonical_function_not_security_definer"
  | "canonical_function_unpinned_search_path"
  | "canonical_function_public_execute";

export type V3S16Finding = {
  domain: string;
  kind: V3S16FindingKind;
  subject: string;
  path?: string;
  detail: string;
  releaseRisk: "hard_blocker";
  ownerBoundary?: "shared" | "results_pr_1400";
};

export type V3S16Report = {
  schemaVersion: 1;
  policyVersion: typeof V3_S16_POLICY_VERSION;
  candidateSha: string;
  staticAuditPassed: boolean;
  catalogAuditPassed: boolean;
  s16Passed: boolean;
  findings: readonly V3S16Finding[];
  compatibilityDebt: readonly V3S16CompatibilityApplicationWriter[];
  domains: readonly {
    id: string;
    canonicalOwner: string;
    canonicalTables: readonly string[];
    canonicalCommands: readonly string[];
    sanctionedInternalWriters: readonly string[];
    sanctionedCrossDomainWriters: readonly V3S16CrossDomainWriter[];
    sanctionedWriteTriggers: readonly string[];
    temporaryCompatibilityApplicationWriters: readonly V3S16CompatibilityApplicationWriter[];
    allowedColumnDmlGrants: readonly V3S16AllowedColumnGrant[];
    ownerBoundary: "shared" | "results_pr_1400";
  }[];
};

const WRITE_METHOD = /\.(?:insert|update|upsert|delete)\s*\(/;
const FROM_CALL = /(?:([A-Za-z_$][\w$]*)\s*)?\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const SCHEMA_CALL = /\.schema\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

/**
 * These are database client namespaces, not sanctioned writers. S16 must not
 * mistake `televoting.editions` for `public.editions` merely because Supabase
 * clients express a configured schema separately from their table selection.
 * The corresponding client configuration is regression-tested independently.
 */
const KNOWN_CLIENT_SCHEMA_BY_RECEIVER: Readonly<Record<string, string>> = {
  televotingAdmin: "televoting",
  televotingDb: "televoting",
};

function normalizeTable(value: string) {
  return value.replace(/^public\./, "");
}

function normalizeFunctionName(value: string) {
  return value.trim().toLowerCase();
}

function bareFunctionName(value: string) {
  return normalizeFunctionName(value).split(".").at(-1) ?? normalizeFunctionName(value);
}

function functionNameMatches(inventoryName: string, catalogName: string) {
  const inventory = normalizeFunctionName(inventoryName);
  const catalog = normalizeFunctionName(catalogName);
  if (inventory.includes(".")) return inventory === catalog;
  return inventory === catalog || inventory === bareFunctionName(catalog);
}

function sourceWritesTable(source: string, table: string) {
  const normalizedTarget = normalizeTable(table);
  const targetParts = table.split(".");
  const explicitSchema = targetParts.length > 1 ? targetParts[0] : null;
  const targetName = targetParts.at(-1)!;

  for (const match of source.matchAll(FROM_CALL)) {
    const receiver = match[1] ?? "";
    const fromTable = match[2];
    if (fromTable !== targetName && normalizeTable(fromTable) !== normalizedTarget) continue;
    const start = match.index ?? 0;
    const before = source.slice(Math.max(0, start - 240), start);
    const rawAfter = source.slice(start, Math.min(source.length, start + 900));
    const nextFrom = rawAfter.slice(match[0].length).search(/\.from\s*\(/);
    const semicolon = rawAfter.indexOf(";");
    const endCandidates = [nextFrom >= 0 ? match[0].length + nextFrom : -1, semicolon].filter((value) => value > 0);
    const chain = rawAfter.slice(0, endCandidates.length ? Math.min(...endCandidates) : rawAfter.length);
    if (!WRITE_METHOD.test(chain)) continue;

    if (explicitSchema) {
      const schemas = [...before.matchAll(SCHEMA_CALL)];
      const inlineSchema = schemas.at(-1)?.[1];
      const receiverSchema = KNOWN_CLIENT_SCHEMA_BY_RECEIVER[receiver];
      const resolvedSchema = inlineSchema ?? receiverSchema ?? "public";
      if (resolvedSchema !== explicitSchema) continue;
    }
    return true;
  }
  return false;
}

function sourceDefinesCommand(source: string, command: string) {
  const normalized = normalizeFunctionName(command);
  const parts = normalized.split(".");
  const bare = parts.at(-1) ?? normalized;
  const escapedBare = bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const explicitSchema = parts.length > 1 ? parts.slice(0, -1).join(".") : null;
  const escapedSchema = explicitSchema?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const qualified = escapedSchema
    ? `${escapedSchema}\\s*\\.\\s*${escapedBare}`
    : `(?:[a-z_][a-z0-9_$]*\\s*\\.\\s*)?${escapedBare}`;
  return new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${qualified}\\s*\\(`,
    "i",
  ).test(source);
}

function pinnedSearchPath(value: string | null) {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  return normalized.includes("pg_catalog") && !normalized.includes("$user");
}

function classifiedWriterNames(domain: V3S16DomainDefinition) {
  return [
    ...domain.canonicalCommands,
    ...(domain.sanctionedInternalWriters ?? []),
    ...(domain.sanctionedCrossDomainWriters ?? []).map((writer) => writer.functionName),
  ];
}

function isClassifiedWriter(domain: V3S16DomainDefinition, functionName: string) {
  return classifiedWriterNames(domain)
    .some((name) => functionNameMatches(name, functionName));
}

function classifiedFunctionEvidence(
  catalog: V3S16CatalogEvidence,
  functionName: string,
) {
  return catalog.functions.find((fn) => functionNameMatches(functionName, fn.name));
}

function compatibilityWriter(
  domain: V3S16DomainDefinition,
  path: string,
  table: string,
) {
  return (domain.temporaryCompatibilityApplicationWriters ?? []).find(
    (writer) => writer.path === path && writer.table === table,
  );
}

function isAllowedColumnGrant(
  domain: V3S16DomainDefinition,
  table: string,
  grant: V3S16CatalogColumnDmlGrant,
) {
  return (domain.allowedColumnDmlGrants ?? []).some((allowed) =>
    allowed.table === table &&
    allowed.role.toLowerCase() === grant.role.toLowerCase() &&
    allowed.privilege === grant.privilege.toUpperCase() &&
    allowed.column === grant.column,
  );
}

const SHOW_COMPATIBILITY_WRITERS: readonly V3S16CompatibilityApplicationWriter[] = [
  {
    path: "src/routes/_authenticated/admin/design.$slug.tsx",
    table: "public.shows",
    ownerDomain: "design/broadcast-presentation",
    columns: ["theme_id", "broadcast_config"],
    reason: "Presentation configuration remains a neighbouring-domain compatibility path; database runtime/cue subtree guards prevent it from mutating showMode or studio2Rundown authority.",
    sunsetCondition: "Replace direct show presentation UPDATE with its domain-owned governed presentation command.",
  },
  {
    path: "src/components/admin/ShowLineupWorkspace.tsx",
    table: "public.shows",
    ownerDomain: "lineup",
    columns: ["lineup_stage"],
    reason: "Lineup stage is configuration owned by the lineup domain, not live-show lifecycle truth.",
    sunsetCondition: "Migrate lineup_stage to the lineup domain command boundary and revoke its compatibility column grant.",
  },
  {
    path: "src/routes/_authenticated/admin/voting-system/$slug.tsx",
    table: "public.shows",
    ownerDomain: "voting-configuration",
    columns: ["voting_config", "qualifier_count"],
    reason: "Voting configuration remains owned by the voting/Televote lane; this show-authority lane must not create a second voting mutation authority.",
    sunsetCondition: "Voting/Televote owner migrates these fields to its canonical command and the show-table compatibility grants are revoked.",
  },
];

const SHOW_COMPATIBILITY_COLUMN_GRANTS: readonly V3S16AllowedColumnGrant[] = [
  ...["theme_id", "broadcast_config"].map((column) => ({
    table: "public.shows",
    role: "authenticated",
    privilege: "UPDATE" as const,
    column,
    ownerDomain: "design/broadcast-presentation",
    sunsetCondition: "Presentation command cutover",
  })),
  {
    table: "public.shows",
    role: "authenticated",
    privilege: "UPDATE",
    column: "lineup_stage",
    ownerDomain: "lineup",
    sunsetCondition: "Lineup stage command cutover",
  },
  ...["voting_config", "qualifier_count"].map((column) => ({
    table: "public.shows",
    role: "authenticated",
    privilege: "UPDATE" as const,
    column,
    ownerDomain: "voting-configuration",
    sunsetCondition: "Voting/Televote command cutover",
  })),
];

export const V3_S16_CRITICAL_DOMAINS: readonly V3S16DomainDefinition[] = [
  {
    id: "account-session",
    risk: "security_critical",
    canonicalTables: [
      "auth.sessions",
      "public.country_accounts",
      "public.studio2_account_session_revocations",
    ],
    canonicalOwner: "Supabase Auth plus governed Solaris account/session commands",
    canonicalCommands: [
      "public.v3_claim_country_account",
      "public.v3_set_country_account_status",
      "public.v3_set_owned_hod_auto_assign",
      "public.v3_revoke_session",
    ],
    // The auth.users AFTER INSERT trigger is the only account writer before an
    // authenticated Solaris session exists. It is private-by-privilege and the
    // account table guard requires the same internal write marker as commands.
    sanctionedInternalWriters: ["public.claim_country_from_signup"],
    sanctionedWriteTriggers: [
      "ensure_country_account_hod_role",
      "studio2_platform_direct_write_guard",
      "touch_country_accounts_updated_at",
      "v3_guard_country_account_writer",
    ],
  },
  {
    id: "media-upload",
    risk: "security_critical",
    canonicalTables: ["public.studio2_upload_authorizations"],
    canonicalOwner: "media upload authorization and finalization commands",
    canonicalCommands: ["public.studio2_prepare_upload", "public.v3_finalize_media_upload"],
    sanctionedInternalWriters: ["private.studio2_create_evidence_upload_authorization"],
  },
  {
    id: "integrity",
    risk: "integrity_critical",
    canonicalTables: [
      "public.integrity_cases",
      "public.integrity_case_events",
      "public.integrity_case_relations",
      "public.integrity_case_evidence",
      "public.integrity_case_appeals",
      "public.integrity_case_findings",
      "public.integrity_case_sanctions",
      "public.integrity_adjudication_history",
    ],
    canonicalOwner: "Integrity case and appeal adjudication authority",
    canonicalCommands: [
      "public.v3_public_create_anonymous_integrity_case",
      "public.v3_create_protected_integrity_case",
      "public.v3_reporter_reply_integrity_case",
      "public.v3_public_reply_anonymous_integrity_case",
      "public.studio2_integrity_case_transition",
      "public.studio2_integrity_assign_case_reviewer",
      "public.studio2_integrity_recuse_case_reviewer",
      "public.studio2_integrity_set_case_priority",
      "public.studio2_integrity_reply_case",
      "public.studio2_integrity_add_case_note",
      "public.studio2_integrity_link_cases",
      "public.studio2_integrity_register_evidence",
      "public.studio2_integrity_record_preclearance_ruling",
      "public.studio2_integrity_record_finding",
      "public.studio2_integrity_record_sanction",
      "public.studio2_integrity_set_case_retention",
      "public.v3_submit_integrity_appeal",
      "public.v3_public_submit_anonymous_integrity_appeal",
      "public.studio2_integrity_assign_appeal_reviewer",
      "public.studio2_integrity_resolve_appeal",
      "public.studio2_integrity_grant_appeal_extension",
      "public.admin_cancel_integrity_evidence_deletion",
      "public.admin_create_integrity_evidence_disclosure_copy",
      "public.admin_decide_sealed_identity_disclosure",
      "public.admin_discard_expired_evidence_upload",
      "public.admin_finalize_integrity_evidence_deletion",
      "public.admin_finalize_integrity_evidence_derivative",
      "public.admin_integrity_reporter_identity",
      "public.admin_publish_integrity_decision",
      "public.admin_request_sealed_identity_disclosure",
      "public.admin_reveal_sealed_identity",
      "public.admin_schedule_integrity_evidence_deletion",
      "public.admin_upsert_integrity_rule_link",
    ],
    sanctionedInternalWriters: [
      "public.public_create_anonymous_integrity_case_impl",
      "public.create_protected_integrity_case_impl",
      "public.v3_public_create_anonymous_integrity_case_impl",
      "public.v3_create_protected_integrity_case_impl",
      "public.reporter_reply_integrity_case_impl",
      "public.public_reply_anonymous_integrity_case_impl",
      "public.reporter_submit_integrity_appeal_impl",
      "public.public_submit_anonymous_integrity_appeal_impl",
      "public.admin_set_integrity_priority_impl",
      "public.admin_reply_integrity_case_impl",
      "public.admin_record_integrity_finding_impl",
      "public.admin_record_integrity_sanction_impl",
      "public.admin_recuse_from_integrity_case_impl",
      "public.admin_add_integrity_case_note_impl",
      "public.admin_record_integrity_preclearance_ruling_impl",
      "public.admin_set_integrity_case_retention_impl",
      // Owner-only token primitive; protected/anonymous wrappers validate the
      // reporter credential and derive the actor. Executable boundary proof:
      // .github/tests/v3-integrity-evidence-write-boundary.sql
      "public.integrity_finalize_evidence_token",
      // Deterministic reconciliation primitive. External EXECUTE is revoked;
      // governed SECURITY DEFINER callers own the semantic request.
      "public.integrity_expire_stale_identity_approvals",
      "private.v3_integrity_case_changed_event",
      "private.v3_integrity_appeal_changed_event",
    ],
    sanctionedCrossDomainWriters: [
      {
        functionName: "public.admin_create_rule_interpretation_from_integrity_case",
        ownerDomain: "rules",
        scope: "rule-question case/ruling provenance and Integrity audit event only",
        reason: "Rules owns the interpretation draft; the RPC is live-session gated and requires both rules.edit and integrity.manage before consuming protected Integrity state.",
      },
    ],
    sanctionedWriteTriggers: [
      "v3_integrity_case_before_update",
      "v3_integrity_case_changed_event",
      "v3_integrity_appeal_before_update",
      "v3_integrity_appeal_changed_event",
      "v3_integrity_history_immutable",
      "integrity_evidence_inherit_case_retention",
      "integrity_evidence_validate_lineage",
      "organizer_inbox_integrity_case_insert",
      "organizer_inbox_integrity_appeal_insert",
      "organizer_inbox_case_state",
      "organizer_inbox_appeal_state",
      "organizer_inbox_integrity_case_resolution",
    ],
    knownLegacyWriterPatterns: [
      { id: "legacy-direct-integrity-table-write", pattern: /\.from\(\s*["'`](?:integrity_cases|integrity_case_appeals|integrity_case_findings|integrity_case_sanctions)["'`]\s*\)\s*\.(?:insert|update|upsert|delete)\s*\(/ },
    ],
  },
  {
    id: "results",
    risk: "integrity_critical",
    canonicalTables: ["public.results", "public.studio2_result_operations", "public.studio2_result_operation_executions", "public.televoting_round_bindings"],
    canonicalOwner: "Results / PR #1400 frozen mutation owner",
    canonicalCommands: [],
    resultsFrozenOwner: true,
  },
  {
    id: "televote",
    risk: "integrity_critical",
    canonicalTables: [
      "public.televote_votes",
      "televoting.rounds",
      "televoting.round_entries",
      "televoting.round_countries",
      "televoting.vote_submissions",
      "televoting.vote_entries",
      "televoting.televote_aggregations",
      "televoting.combined_televote_results",
    ],
    canonicalOwner: "televote domain",
    // Exact attachment, owner, path and external EXECUTE tested by the status SQL proof.
    sanctionedWriteTriggers: ["v3_combined_command_version"],
    canonicalCommands: [
      "televoting.v3_create_round",
      "televoting.v3_rename_round",
      "televoting.v3_delete_draft_round",
      "televoting.studio2_apply_round_status_change",
      "televoting.studio2_apply_round_deadline_change",
      "televoting.v3_moderate_submission",
      "televoting.v3_configure_round",
      "televoting.v3_sync_round_lineup",
      // Scoped atomic reconciliation; executable SQL proof rejects stale input
      // and revoked actors and recovers the exact committed operation receipt.
      "televoting.v3_reconcile_combined_lineup",
      "televoting.v3_transition_combined_status",
      "televoting.v3_delete_combined_aggregation",
      "televoting.v3_update_combined_metadata",
      "televoting.v3_create_combined_aggregation",
      "televoting.v3_manage_combined_sources",
      "televoting.v3_calculate_combined",
      "televoting.submit_vote_checked",
      "public.studio2_update_televote_aggregate_totals",
    ],
  },
  {
    id: "jury",
    risk: "integrity_critical",
    canonicalTables: [
      "public.jury_voting_windows",
      "public.jury_ballot_submissions",
      "public.jury_votes",
      "public.studio2_jury_window_versions",
    ],
    canonicalOwner: "jury domain",
    canonicalCommands: [
      "v3_submit_jury_ballot",
      "studio2_apply_jury_voting_status",
    ],
    sanctionedInternalWriters: ["submit_country_jury_ballot"],
  },
  {
    id: "confirmation",
    risk: "integrity_critical",
    canonicalTables: [
      "public.submission_rounds",
      "public.submissions",
      "public.submission_versions",
      "public.studio2_confirmation_requirements",
      "public.studio2_confirmation_round_versions",
      "private.v3_confirmation_operations",
    ],
    canonicalOwner: "confirmation domain",
    canonicalCommands: [
      "v3_submit_confirmation",
      "studio2_apply_confirmation_round_change",
      "admin_update_confirmation_controls",
      // Versioned delete replaces the old signature; S2 owns recovery after deletion.
      // .github/tests/v3-confirmation-runtime-state-authority.sql
      "public.admin_confirmation_delete_response",
      "public.admin_restore_confirmation_version",
      "public.admin_confirmation_reconfirm",
      "public.admin_confirmation_waive_requirement",
      "public.admin_confirmation_apply_requirement_materialization",
    ],
    sanctionedInternalWriters: ["v3_submit_confirmation_core", "submit_confirmation"],
    sanctionedWriteTriggers: [
      "v3_bridge_confirmation_submission_operation",
      "revoke_confirmation_tokens_on_submission_close",
      "revoke_confirmation_tokens_on_round_close",
    ],
  },
  {
    id: "entry",
    risk: "integrity_critical",
    canonicalTables: ["public.entries", "public.internal_entries"],
    canonicalOwner: "entry domain",
    canonicalCommands: [
      "public.v3_sync_confirmation_entry",
      "public.studio2_apply_confirmation_entry_review",
    ],
    // The public Confirmation command owns authentication/edit-window policy;
    // these helpers are inaccessible directly and implement the participant
    // content mutation inside that governed transaction.
    sanctionedInternalWriters: [
      "public.v3_submit_confirmation_core",
      "public.submit_confirmation",
    ],
  },
  {
    id: "publication",
    risk: "integrity_critical",
    canonicalTables: ["public.studio2_show_publication_controls", "public.studio2_show_publication_executions"],
    canonicalOwner: "publication domain",
    canonicalCommands: ["studio2_apply_show_publication_change", "studio2_publish_due_show_publications"],
    sanctionedInternalWriters: ["studio2_create_show_publication_control", "studio2_ensure_show_publication_control"],
    // Owner-only guard, exact attachments and archived owner-DML denials:
    // .github/tests/v3-archive-internal-guard-authority.sql
    sanctionedWriteTriggers: [
      "v3_guard_archived_edition_workflow_write",
      "v3_validate_publication_control",
      "v3_validate_publication_execution",
      "v3_reject_publication_execution_mutation",
      "v3_validate_publication_projection_from_control",
      "v3_emit_scheduled_publication_event",
    ],
  },
  {
    id: "authorization",
    risk: "security_critical",
    canonicalTables: [
      "public.studio2_capability_grants",
      "public.studio2_role_assignments",
      "public.studio2_role_capabilities",
      "public.studio2_permission_subject_versions",
    ],
    canonicalOwner: "permission engine",
    canonicalCommands: ["public.studio2_apply_permission_change_r3", "public.studio2_approve_permission_change"],
    // Internal code is sanctioned only by the executable mechanism proofs.
    sanctionedInternalWriters: [],
    sanctionedWriteTriggers: [],
  },
  {
    id: "contest-lifecycle",
    risk: "integrity_critical",
    canonicalTables: ["public.editions", "public.studio2_edition_runtime"],
    canonicalOwner: "edition domain",
    canonicalCommands: [
      "public.v3_create_edition",
      "public.v3_apply_edition_metadata_change",
      "public.v3_apply_edition_editing_change",
      "public.v3_apply_edition_theme_change",
      "public.v3_apply_edition_visual_change",
      "public.studio2_transition_edition_v3",
      "public.studio2_execute_host_operation",
      // Existing scoped Confirmation binding command: live session, canonical
      // capability, CAS, fingerprint, R3 freshness, receipt/readback. Proof:
      // .github/tests/v3-archive-runtime-mechanisms.sql
      "public.studio2_apply_confirmation_edition_binding_change",
    ],
    sanctionedInternalWriters: [
      "private.studio2_seed_edition_runtime",
      "public.studio2_apply_confirmation_round_change",
      "public.sync_edition_publication_from_shows",
      "public.bump_edition_data_revision",
      "public.bump_country_edition_revisions",
      // Edition design intentionally projects shared visual defaults into shows.
      // It is trigger-only and not a general show mutation authority.
      "public.sync_edition_design_to_shows",
    ],
    sanctionedWriteTriggers: [
      "editions_sync_year_from_event_date",
      "revoke_confirmation_tokens_on_edition_close",
      "studio2_platform_direct_write_guard",
      "studio2_seed_edition_runtime_after_insert",
      "trg_emit_edition_pulse_event",
      "trg_preserve_edition_public_design_metadata",
      "trg_sync_edition_design_to_shows",
      "trg_sync_edition_palette_after_change",
      "v3_s3_supersede_edition_logo_reviews",
      "studio2_edition_runtime_strict_dual_guard",
      "studio2_edition_runtime_touch_updated_at",
    ],
  },
  {
    id: "show-lifecycle",
    risk: "integrity_critical",
    canonicalTables: ["public.shows"],
    canonicalOwner: "live-show domain",
    canonicalCommands: [
      "public.v3_create_show",
      "public.v3_update_show_definition",
      "public.v3_delete_show",
      "public.v3_apply_show_runtime_change",
      "public.v3_save_show_rundown",
      "public.v3_set_show_rundown_lock",
      "public.v3_transition_show_cue",
    ],
    sanctionedInternalWriters: [
      "public.studio2_save_broadcast_rundown",
      "public.studio2_set_broadcast_rundown_lock",
      "public.studio2_transition_broadcast_segment",
    ],
    sanctionedCrossDomainWriters: [
      {
        functionName: "public.studio2_apply_show_publication_change",
        ownerDomain: "publication",
        scope: "publication projection fields only",
        reason: "Publication has its own governed canonical command and is not show lifecycle authority.",
      },
      {
        functionName: "public.studio2_publish_due_show_publications",
        ownerDomain: "publication",
        scope: "scheduled publication projection only",
        reason: "Bounded publication job owns publication timing, not live-show state.",
      },
      {
        functionName: "public.studio2_execute_host_operation",
        ownerDomain: "host/edition",
        scope: "host country/city only",
        reason: "Host assignment is an edition/hosting operation sharing the show row, not live-show lifecycle authority.",
      },
      {
        functionName: "public.sync_edition_design_to_shows",
        ownerDomain: "design/broadcast-presentation",
        scope: "theme/presentation inheritance with showMode and studio2Rundown preserved",
        reason: "The trigger helper is non-callable to API roles after the show cue cutover and cannot own live runtime/cue state.",
      },
    ],
    // Executable owner/EXECUTE/attachment and archived-show denial proof:
    // .github/tests/v3-archive-internal-guard-authority.sql
    sanctionedWriteTriggers: [
      "v3_guard_archived_edition_workflow_write",
      "guard_result_publication_requires_reveal_ready",
      "normalize_show_publication_channels_trigger",
      "shows_sync_edition_publication",
      "shows_sync_semi_final_qualifiers",
      "studio2_create_show_publication_control",
      "studio2_guard_direct_show_publication_write",
      "studio2_locked_rundown_live_state_guard",
      "studio2_platform_direct_write_guard",
      "studio2_serialize_show_publication_with_results",
      "trg_emit_show_pulse_events",
      "trg_inherit_edition_design_on_show",
      "trg_materialize_results_on_show_publish",
      "trg_rerank_results_after_voting_config_change",
      "update_shows_updated_at",
      "v3_guard_jury_show_reference_scope",
      "v3_validate_publication_projection_from_show",
      "v3_guard_show_cue_authority",
      "v3_guard_show_runtime_authority",
    ],
    temporaryCompatibilityApplicationWriters: SHOW_COMPATIBILITY_WRITERS,
    allowedColumnDmlGrants: SHOW_COMPATIBILITY_COLUMN_GRANTS,
  },
];

export function scanV3S16StaticAuthority(
  files: readonly V3S16SourceFile[],
  domains: readonly V3S16DomainDefinition[] = V3_S16_CRITICAL_DOMAINS,
): V3S16Finding[] {
  const findings: V3S16Finding[] = [];
  const productionFiles = files.filter((file) =>
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file.path) &&
    !file.path.includes("/fixtures/") &&
    !file.path.startsWith("supabase/migrations/") &&
    !file.path.startsWith(".github/tests/"),
  );
  const migrationFiles = files.filter((file) => file.path.startsWith("supabase/migrations/"));

  for (const domain of domains) {
    const ownerBoundary = domain.resultsFrozenOwner ? "results_pr_1400" : "shared";
    for (const file of productionFiles) {
      for (const table of domain.canonicalTables) {
        if (!sourceWritesTable(file.source, table)) continue;
        if (compatibilityWriter(domain, file.path, table)) continue;
        findings.push({
          domain: domain.id,
          kind: "direct_application_writer",
          subject: table,
          path: file.path,
          detail: `Production source directly mutates canonical table ${table}; S16 requires an explicitly governed canonical command boundary.`,
          releaseRisk: "hard_blocker",
          ownerBoundary,
        });
      }
      for (const legacy of domain.knownLegacyWriterPatterns ?? []) {
        legacy.pattern.lastIndex = 0;
        if (!legacy.pattern.test(file.source)) continue;
        findings.push({
          domain: domain.id,
          kind: "competing_legacy_writer",
          subject: legacy.id,
          path: file.path,
          detail: `Legacy mutation authority ${legacy.id} remains reachable in production source.`,
          releaseRisk: "hard_blocker",
          ownerBoundary,
        });
      }
    }

    if (!domain.resultsFrozenOwner) {
      for (const command of domain.canonicalCommands) {
        if (migrationFiles.some((file) => sourceDefinesCommand(file.source, command))) continue;
        findings.push({
          domain: domain.id,
          kind: "missing_canonical_command_definition",
          subject: command,
          detail: `No migration defines canonical mutation function ${command}.`,
          releaseRisk: "hard_blocker",
          ownerBoundary,
        });
      }
    }
  }
  return findings;
}

export function auditV3S16CatalogAuthority(
  catalog: V3S16CatalogEvidence | null,
  candidateSha: string,
  domains: readonly V3S16DomainDefinition[] = V3_S16_CRITICAL_DOMAINS,
): V3S16Finding[] {
  if (!catalog || catalog.candidateSha !== candidateSha) {
    return domains.map((domain) => ({
      domain: domain.id,
      kind: "catalog_evidence_missing" as const,
      subject: "pg_catalog",
      detail: !catalog ? "Exact-SHA local pg_catalog authority evidence was not supplied." : `Catalog evidence certifies ${catalog.candidateSha}, not ${candidateSha}.`,
      releaseRisk: "hard_blocker" as const,
      ownerBoundary: domain.resultsFrozenOwner ? "results_pr_1400" as const : "shared" as const,
    }));
  }

  const findings: V3S16Finding[] = [];
  const tableByName = new Map(catalog.tables.map((table) => [table.table, table]));
  const directDmlRoles = new Set(["anon", "authenticated", "service_role", "public"]);
  const mechanisms = proveInternalMechanisms(catalog);

  for (const domain of domains) {
    const ownerBoundary = domain.resultsFrozenOwner ? "results_pr_1400" : "shared";
    const sanctionedTriggers = new Set(domain.sanctionedWriteTriggers ?? []);
    for (const table of domain.canonicalTables) {
      const evidence = tableByName.get(table);
      if (!evidence) {
        findings.push({ domain: domain.id, kind: "catalog_table_missing", subject: table, detail: "Critical canonical table is absent from exact-SHA catalog evidence.", releaseRisk: "hard_blocker", ownerBoundary });
        continue;
      }
      const unexpectedRoles = evidence.dmlRoles.filter((role) => directDmlRoles.has(role.toLowerCase()));
      if (unexpectedRoles.length) findings.push({ domain: domain.id, kind: "unexpected_direct_dml_role", subject: table, detail: `Direct DML remains granted to ${unexpectedRoles.join(", ")}.`, releaseRisk: "hard_blocker", ownerBoundary });

      const columnRoles = (evidence.columnDmlRoles ?? []).filter((role) => directDmlRoles.has(role.toLowerCase()));
      if (columnRoles.length && !evidence.columnDmlGrants?.length) {
        findings.push({
          domain: domain.id,
          kind: "column_dml_scope_unproven",
          subject: table,
          detail: `Column-level DML exists for ${columnRoles.join(", ")} but exact column evidence is absent; S16 cannot prove the grant is bounded.`,
          releaseRisk: "hard_blocker",
          ownerBoundary,
        });
      }
      for (const grant of evidence.columnDmlGrants ?? []) {
        if (!directDmlRoles.has(grant.role.toLowerCase())) continue;
        if (isAllowedColumnGrant(domain, table, grant)) continue;
        findings.push({
          domain: domain.id,
          kind: "unexpected_column_dml_role",
          subject: `${table}.${grant.column}`,
          detail: `${grant.privilege} remains granted to ${grant.role} on ${grant.column} outside the domain's bounded compatibility contract.`,
          releaseRisk: "hard_blocker",
          ownerBoundary,
        });
      }

      if (evidence.rlsEnabled === false && !table.startsWith("private.")) findings.push({ domain: domain.id, kind: "rls_not_enabled", subject: table, detail: "RLS is disabled on an API-visible critical table.", releaseRisk: "hard_blocker", ownerBoundary });
      for (const trigger of evidence.writeTriggers ?? []) {
        if (sanctionedTriggers.has(trigger)) continue;
        if (mechanisms.triggers.has(`${domain.id}:${table}:${trigger}`)) continue;
        findings.push({ domain: domain.id, kind: "unexpected_write_trigger", subject: trigger, detail: `Write trigger ${trigger} can mutate or redirect critical state and must be explicitly sanctioned.`, releaseRisk: "hard_blocker", ownerBoundary });
      }
      for (const view of evidence.updatableViews ?? []) findings.push({ domain: domain.id, kind: "unexpected_updatable_view", subject: view, detail: `Updatable view ${view} exposes an alternative write path to critical state.`, releaseRisk: "hard_blocker", ownerBoundary });
    }

    const tableSet = new Set(domain.canonicalTables);
    for (const fn of catalog.functions) {
      const writesCritical = (fn.writesTables ?? []).some((table) => tableSet.has(table));
      if (!writesCritical || isClassifiedWriter(domain, fn.name) || mechanisms.writers.has(`${domain.id}:${fn.oid}`)) continue;
      findings.push({
        domain: domain.id,
        kind: "competing_legacy_writer",
        subject: fn.name,
        detail: `Database function ${fn.name} writes critical ${domain.id} state but is not classified as a sanctioned mutation authority.`,
        releaseRisk: "hard_blocker",
        ownerBoundary,
      });
    }

    if (domain.resultsFrozenOwner) continue;
    for (const writer of [...domain.canonicalCommands, ...(domain.sanctionedInternalWriters ?? [])]) {
      const fn = classifiedFunctionEvidence(catalog, writer);
      if (!fn) {
        findings.push({ domain: domain.id, kind: "canonical_function_missing", subject: writer, detail: "Classified mutation function is absent from catalog evidence.", releaseRisk: "hard_blocker", ownerBoundary });
        continue;
      }
      if (!fn.securityDefiner) findings.push({ domain: domain.id, kind: "canonical_function_not_security_definer", subject: writer, detail: "Classified mutation function is not SECURITY DEFINER and cannot own or safely support a revoked-table boundary.", releaseRisk: "hard_blocker", ownerBoundary });
      if (!pinnedSearchPath(fn.searchPath)) findings.push({ domain: domain.id, kind: "canonical_function_unpinned_search_path", subject: writer, detail: "SECURITY DEFINER mutation function lacks a pinned safe search_path containing pg_catalog.", releaseRisk: "hard_blocker", ownerBoundary });
      if (fn.executeRoles.some((role) => role.toLowerCase() === "public")) findings.push({ domain: domain.id, kind: "canonical_function_public_execute", subject: writer, detail: "Classified mutation function is executable by PUBLIC.", releaseRisk: "hard_blocker", ownerBoundary });
    }
  }
  return findings;
}

export function buildV3S16MutationAuthorityReport(input: {
  candidateSha: string;
  files: readonly V3S16SourceFile[];
  catalog?: V3S16CatalogEvidence | null;
  domains?: readonly V3S16DomainDefinition[];
}): V3S16Report {
  const domains = input.domains ?? V3_S16_CRITICAL_DOMAINS;
  const staticFindings = scanV3S16StaticAuthority(input.files, domains);
  const catalogFindings = auditV3S16CatalogAuthority(input.catalog ?? null, input.candidateSha, domains);
  const findings = [...staticFindings, ...catalogFindings];
  return {
    schemaVersion: 1,
    policyVersion: V3_S16_POLICY_VERSION,
    candidateSha: input.candidateSha,
    staticAuditPassed: staticFindings.length === 0,
    catalogAuditPassed: catalogFindings.length === 0,
    s16Passed: findings.length === 0,
    findings,
    compatibilityDebt: domains.flatMap((domain) => domain.temporaryCompatibilityApplicationWriters ?? []),
    domains: domains.map((domain) => ({
      id: domain.id,
      canonicalOwner: domain.canonicalOwner,
      canonicalTables: domain.canonicalTables,
      canonicalCommands: domain.canonicalCommands,
      sanctionedInternalWriters: domain.sanctionedInternalWriters ?? [],
      sanctionedCrossDomainWriters: domain.sanctionedCrossDomainWriters ?? [],
      sanctionedWriteTriggers: domain.sanctionedWriteTriggers ?? [],
      temporaryCompatibilityApplicationWriters: domain.temporaryCompatibilityApplicationWriters ?? [],
      allowedColumnDmlGrants: domain.allowedColumnDmlGrants ?? [],
      ownerBoundary: domain.resultsFrozenOwner ? "results_pr_1400" : "shared",
    })),
  };
}
