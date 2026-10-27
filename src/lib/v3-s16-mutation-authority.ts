export const V3_S16_POLICY_VERSION = "v3-s16-mutation-authority-4" as const;

export type V3S16Risk = "integrity_critical" | "security_critical";

export type V3S16DomainDefinition = {
  id: string;
  risk: V3S16Risk;
  canonicalTables: readonly string[];
  canonicalOwner: string;
  canonicalCommands: readonly string[];
  sanctionedInternalWriters?: readonly string[];
  sanctionedWriteTriggers?: readonly string[];
  resultsFrozenOwner?: boolean;
  knownLegacyWriterPatterns?: readonly { id: string; pattern: RegExp }[];
};

export type V3S16SourceFile = { path: string; source: string };

export type V3S16CatalogTableEvidence = {
  table: string;
  owner: string | null;
  rlsEnabled: boolean | null;
  dmlRoles: readonly string[];
  columnDmlRoles?: readonly string[];
  writeTriggers?: readonly string[];
  updatableViews?: readonly string[];
};

export type V3S16CatalogFunctionEvidence = {
  name: string;
  owner: string | null;
  securityDefiner: boolean;
  searchPath: string | null;
  executeRoles: readonly string[];
  writesTables?: readonly string[];
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
  domains: readonly {
    id: string;
    canonicalOwner: string;
    canonicalTables: readonly string[];
    canonicalCommands: readonly string[];
    sanctionedInternalWriters: readonly string[];
    sanctionedWriteTriggers: readonly string[];
    ownerBoundary: "shared" | "results_pr_1400";
  }[];
};

const WRITE_METHOD = /\.(?:insert|update|upsert|delete)\s*\(/;
const FROM_CALL = /\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const SCHEMA_CALL = /\.schema\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

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
    if (match[1] !== targetName && normalizeTable(match[1]) !== normalizedTarget) continue;
    const start = match.index ?? 0;
    const before = source.slice(Math.max(0, start - 180), start);
    const rawAfter = source.slice(start, Math.min(source.length, start + 900));
    const nextFrom = rawAfter.slice(match[0].length).search(/\.from\s*\(/);
    const semicolon = rawAfter.indexOf(";");
    const endCandidates = [nextFrom >= 0 ? match[0].length + nextFrom : -1, semicolon].filter((value) => value > 0);
    const chain = rawAfter.slice(0, endCandidates.length ? Math.min(...endCandidates) : rawAfter.length);
    if (!WRITE_METHOD.test(chain)) continue;
    if (explicitSchema) {
      const schemas = [...before.matchAll(SCHEMA_CALL)];
      const closest = schemas.at(-1)?.[1];
      if (closest && closest !== explicitSchema) continue;
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

function isClassifiedWriter(domain: V3S16DomainDefinition, functionName: string) {
  return [...domain.canonicalCommands, ...(domain.sanctionedInternalWriters ?? [])]
    .some((name) => functionNameMatches(name, functionName));
}

function classifiedFunctionEvidence(
  catalog: V3S16CatalogEvidence,
  functionName: string,
) {
  return catalog.functions.find((fn) => functionNameMatches(functionName, fn.name));
}

export const V3_S16_CRITICAL_DOMAINS: readonly V3S16DomainDefinition[] = [
  {
    id: "account-session",
    risk: "security_critical",
    canonicalTables: ["auth.sessions", "public.studio2_account_session_revocations"],
    canonicalOwner: "Supabase Auth / account session recovery",
    canonicalCommands: ["public.v3_revoke_session"],
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
      "public.integrity_case_appeals",
      "public.integrity_case_evidence",
    ],
    canonicalOwner: "integrity governance",
    canonicalCommands: [],
  },
  {
    id: "results",
    risk: "integrity_critical",
    canonicalTables: ["public.results", "public.studio2_result_operations", "public.studio2_result_operation_executions"],
    canonicalOwner: "Results / PR #1400 frozen mutation owner",
    canonicalCommands: [],
    resultsFrozenOwner: true,
  },
  {
    id: "televote",
    risk: "integrity_critical",
    canonicalTables: [
      "public.televote_votes",
      "public.televoting_round_bindings",
      "televoting.rounds",
      "televoting.vote_submissions",
      "televoting.vote_entries",
      "televoting.televote_aggregations",
      "televoting.combined_televote_results",
    ],
    canonicalOwner: "televote domain",
    canonicalCommands: [
      "televoting.v3_create_round",
      "televoting.v3_rename_round",
      "televoting.v3_delete_draft_round",
      "televoting.studio2_apply_round_status_change",
      "televoting.studio2_apply_round_deadline_change",
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
    canonicalCommands: [
      "studio2_apply_show_publication_change",
      "studio2_publish_due_show_publications",
    ],
    sanctionedInternalWriters: [
      "studio2_create_show_publication_control",
      "studio2_ensure_show_publication_control",
    ],
    sanctionedWriteTriggers: [
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
    canonicalCommands: ["public.studio2_apply_permission_change_r3"],
    sanctionedInternalWriters: [
      "public.studio2_apply_permission_change",
      "private.studio2_touch_permission_subject_version",
    ],
    sanctionedWriteTriggers: [
      "studio2_role_assignment_version_bump",
      "studio2_capability_grant_version_bump",
      "studio2_role_assignments_touch_subject_version",
      "studio2_capability_grants_touch_subject_version",
    ],
  },
  {
    id: "contest-lifecycle",
    risk: "integrity_critical",
    canonicalTables: ["public.editions", "public.shows", "public.studio2_edition_runtime"],
    canonicalOwner: "edition/live-show domains",
    canonicalCommands: ["public.v3_apply_edition_visual_change"],
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
      if (columnRoles.length) findings.push({ domain: domain.id, kind: "unexpected_column_dml_role", subject: table, detail: `Column-level DML remains granted to ${columnRoles.join(", ")}.`, releaseRisk: "hard_blocker", ownerBoundary });
      if (evidence.rlsEnabled === false && !table.startsWith("private.")) findings.push({ domain: domain.id, kind: "rls_not_enabled", subject: table, detail: "RLS is disabled on an API-visible critical table.", releaseRisk: "hard_blocker", ownerBoundary });
      for (const trigger of evidence.writeTriggers ?? []) {
        if (sanctionedTriggers.has(trigger)) continue;
        findings.push({ domain: domain.id, kind: "unexpected_write_trigger", subject: trigger, detail: `Write trigger ${trigger} can mutate or redirect critical state and must be explicitly sanctioned.`, releaseRisk: "hard_blocker", ownerBoundary });
      }
      for (const view of evidence.updatableViews ?? []) findings.push({ domain: domain.id, kind: "unexpected_updatable_view", subject: view, detail: `Updatable view ${view} exposes an alternative write path to critical state.`, releaseRisk: "hard_blocker", ownerBoundary });
    }

    const tableSet = new Set(domain.canonicalTables);
    for (const fn of catalog.functions) {
      const writesCritical = (fn.writesTables ?? []).some((table) => tableSet.has(table));
      if (!writesCritical || isClassifiedWriter(domain, fn.name)) continue;
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
    domains: domains.map((domain) => ({
      id: domain.id,
      canonicalOwner: domain.canonicalOwner,
      canonicalTables: domain.canonicalTables,
      canonicalCommands: domain.canonicalCommands,
      sanctionedInternalWriters: domain.sanctionedInternalWriters ?? [],
      sanctionedWriteTriggers: domain.sanctionedWriteTriggers ?? [],
      ownerBoundary: domain.resultsFrozenOwner ? "results_pr_1400" : "shared",
    })),
  };
}
