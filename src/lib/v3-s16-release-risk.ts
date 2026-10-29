import type {
  V3S16CatalogEvidence,
  V3S16Finding,
  V3S16Report,
  V3S16SourceFile,
} from "./v3-s16-mutation-authority";

export type V3S16ReleaseRisk = "hard_blocker" | "conditional_blocker";

export type V3S16ClassifiedFinding = Omit<V3S16Finding, "kind" | "releaseRisk"> & {
  kind: V3S16Finding["kind"] | "canonical_command_inventory_missing" | "legacy_application_writer";
  releaseRisk: V3S16ReleaseRisk;
  rule: string;
};

export type V3S16AuthorityContract = {
  domain: string;
  canonicalCommands: readonly string[];
  evidence: readonly string[];
  ownerBoundary?: "shared" | "results_pr_1400";
  legacyApplicationWriters?: readonly {
    id: string;
    pattern: RegExp;
    rationale: string;
  }[];
};

export const V3_S16_AUTHORITY_CONTRACTS: readonly V3S16AuthorityContract[] = [
  {
    domain: "media-upload",
    canonicalCommands: ["public.studio2_prepare_upload", "public.v3_finalize_media_upload"],
    evidence: [
      "supabase/migrations/20261027182223_v3_media_finalization_authority.sql",
      ".github/tests/v3-media-finalization-authority.sql",
      "src/lib/v3-media-finalizer-recovery.test.ts",
    ],
  },
  {
    domain: "contest-lifecycle",
    canonicalCommands: [
      "public.v3_create_edition",
      "public.v3_apply_edition_metadata_change",
      "public.v3_apply_edition_editing_change",
      "public.v3_apply_edition_theme_change",
      "public.v3_apply_edition_visual_change",
      "public.studio2_transition_edition_v3",
      "public.studio2_execute_host_operation",
    ],
    evidence: [
      "supabase/migrations/20261027204500_v3_edition_authority.sql",
      "supabase/migrations/20261027205200_v3_edition_theme_authority.sql",
      "supabase/migrations/20261027210000_v3_retire_confirmation_round_legacy_writers.sql",
      "supabase/migrations/20261027211000_v3_edition_internal_writer_cutover.sql",
      "supabase/migrations/20261027181504_v3_edition_visual_command.sql",
      "supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql",
      "supabase/migrations/20260912171500_studio2_host_management.sql",
      ".github/tests/v3-edition-authority.sql",
      ".github/tests/v3-edition-visual-command.sql",
      "src/lib/v3-edition-authority.contract.test.ts",
      "src/lib/edition-authority.ts",
      "src/lib/edition-theme-command.ts",
    ],
  },
  {
    domain: "account-session",
    canonicalCommands: ["public.v3_revoke_session", "public.v3_claim_country_account", "public.v3_set_country_account_status", "public.v3_set_owned_hod_auto_assign"],
    evidence: [
      "supabase/migrations/20261016163100_v3_account_session_management_hardening.sql",
      ".github/scripts/v3-account-session-management-rehearsal.sh",
      ".github/tests/v3-account-session-authority.sql",
    ],
  },
  {
    domain: "show-lifecycle",
    canonicalCommands: [
      "public.v3_create_show", "public.v3_update_show_definition", "public.v3_delete_show",
      "public.v3_apply_show_runtime_change", "public.v3_save_show_rundown",
      "public.v3_set_show_rundown_lock", "public.v3_transition_show_cue",
    ],
    evidence: [".github/tests/v3-show-cue-authority.sql", ".github/tests/v3-show-cue-lock-contract.sql"],
  },
  {
    domain: "entry",
    canonicalCommands: [
      "public.v3_sync_confirmation_entry",
      "public.studio2_apply_confirmation_entry_review",
      "public.studio2_apply_participation_status",
    ],
    evidence: [
      "supabase/migrations/20261027211501_v3_s16_entry_confirmation_authority.sql",
      "supabase/migrations/20261029221500_v3_s16_shared_runtime_authority_cutover.sql",
      "src/lib/v3-s16-entry-authority.contract.test.ts",
      "src/lib/v3-s16-shared-runtime-authority.test.ts",
    ],
  },
  {
    domain: "authorization",
    canonicalCommands: ["public.studio2_apply_permission_change_r3", "public.studio2_approve_permission_change"],
    evidence: ["supabase/migrations/20261027213001_v3_s16_authorization_authority.sql", "supabase/migrations/20261029172000_v3_authorization_command_boundary.sql", ".github/tests/v3-authorization-command-boundary.sql", "src/lib/v3-authorization-mechanisms.test.ts", ".github/tests/v3-canonical-truncate-authority.sql"],
  },
  {
    domain: "televote",
    canonicalCommands: [
      "televoting.v3_create_round", "televoting.v3_rename_round", "televoting.v3_delete_draft_round",
      "televoting.studio2_apply_round_status_change", "televoting.studio2_apply_round_deadline_change",
      "televoting.v3_moderate_submission", "televoting.v3_configure_round", "televoting.v3_sync_round_lineup",
      "televoting.submit_vote_checked", "public.studio2_update_televote_aggregate_totals",
    ],
    evidence: ["src/lib/v3-s16-televote-round-authority.contract.test.ts", "src/lib/v3-s16-televote-moderation-authority.contract.test.ts", "src/lib/studio2-televote-aggregate-cutover.test.ts"],
  },
  {
    domain: "integrity",
    canonicalCommands: [
      "public.v3_public_create_anonymous_integrity_case", "public.v3_create_protected_integrity_case",
      "public.v3_reporter_reply_integrity_case", "public.v3_public_reply_anonymous_integrity_case",
      "public.studio2_integrity_case_transition", "public.studio2_integrity_assign_case_reviewer",
      "public.studio2_integrity_recuse_case_reviewer", "public.studio2_integrity_set_case_priority",
      "public.studio2_integrity_reply_case", "public.studio2_integrity_add_case_note",
      "public.studio2_integrity_record_preclearance_ruling", "public.studio2_integrity_record_finding",
      "public.studio2_integrity_record_sanction", "public.studio2_integrity_set_case_retention",
      "public.v3_submit_integrity_appeal", "public.v3_public_submit_anonymous_integrity_appeal",
      "public.studio2_integrity_assign_appeal_reviewer", "public.studio2_integrity_resolve_appeal",
      "public.studio2_integrity_grant_appeal_extension",
    ],
    evidence: [".github/tests/v3-integrity-authority-catalog.sql", ".github/scripts/run-rules-integrity-security-rehearsal.sh"],
  },
  {
    domain: "results",
    canonicalCommands: [],
    ownerBoundary: "results_pr_1400",
    evidence: ["src/lib/v3-results-integration-contract.ts"],
  },
  {
    domain: "jury",
    canonicalCommands: [
      "public.v3_submit_jury_ballot",
      "public.studio2_apply_jury_voting_status",
      "public.studio2_apply_jury_ballot_review",
      "public.studio2_apply_jury_vote_change",
    ],
    evidence: [
      "supabase/migrations/20261014132819_v3_jury_reliability_foundation.sql",
      "supabase/migrations/20261003014000_organisation_os_v5_jury_window_operations.sql",
      "supabase/migrations/20261029221500_v3_s16_shared_runtime_authority_cutover.sql",
      "supabase/migrations/20261029222500_v3_s16_retire_legacy_jury_score_writers.sql",
      "src/integrations/v3/jury-actions.server.ts",
      "src/lib/v3-jury-vote-command.ts",
      "src/lib/v3-jury-vote-command.test.ts",
      "src/lib/v3-s16-shared-runtime-authority.test.ts",
      "src/components/admin/JuryVotingWindowControl.tsx",
    ],
    legacyApplicationWriters: [
      {
        id: "browser-direct-submit_country_jury_ballot",
        pattern: /\.rpc\(\s*["']submit_country_jury_ballot["']/,
        rationale:
          "The participant browser can still bypass the V3 operation/receipt wrapper when the reliability rollout is disabled.",
      },
      {
        id: "browser-direct-assign_jury_vote",
        pattern: /\.rpc\(\s*["']assign_jury_vote["']/,
        rationale:
          "Organizer score entry must use the governed jury.vote command so CAS, idempotency and operation readback cannot be bypassed.",
      },
      {
        id: "browser-direct-clear_jury_point",
        pattern: /\.rpc\(\s*["']clear_jury_point["']/,
        rationale:
          "Organizer score clearing must use the governed jury.vote command so CAS, idempotency and operation readback cannot be bypassed.",
      },
    ],
  },
  {
    domain: "confirmation",
    canonicalCommands: [
      "public.v3_submit_confirmation",
      "public.studio2_apply_confirmation_round_change",
      "public.admin_update_confirmation_controls",
      "public.admin_confirmation_delete_response",
      "public.admin_restore_confirmation_version",
      "public.admin_confirmation_reconfirm",
      "public.admin_confirmation_waive_requirement",
      "public.admin_confirmation_apply_requirement_materialization",
    ],
    evidence: [
      "supabase/migrations/20261012010000_v3_confirmation_authority.sql",
      "supabase/migrations/20261003018000_organisation_os_v5_confirmation_round_operations.sql",
      "supabase/migrations/20261017143000_confirmation_maintenance_hotfix.sql",
      "supabase/migrations/20261017194000_confirmation_maintenance_readonly_gate.sql",
      "supabase/migrations/20261014040000_v3_entry_restore_provenance.sql",
      "src/integrations/confirmations/admin.ts",
    ],
  },
  {
    domain: "publication",
    canonicalCommands: [
      "public.studio2_apply_show_publication_change",
      "public.studio2_publish_due_show_publications",
    ],
    evidence: [
      "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
      "supabase/migrations/20261015164100_v3_s3_publication_invariants.sql",
      "supabase/migrations/20261016060000_v3_s5_publication_consequences.sql",
      "src/lib/show-publication-lifecycle.ts",
    ],
  },
];

function classifyBaseFinding(finding: V3S16Finding): V3S16ClassifiedFinding {
  return { ...finding, releaseRisk: "hard_blocker", rule: finding.kind };
}

function productionFiles(files: readonly V3S16SourceFile[]) {
  return files.filter((file) =>
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file.path) &&
    !file.path.includes("/fixtures/") &&
    !file.path.startsWith("supabase/migrations/") &&
    !file.path.startsWith(".github/tests/"),
  );
}

function safeSearchPath(value: string | null) {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  return normalized.includes("pg_catalog") && !normalized.includes("$user");
}

function catalogCommandFindings(
  contract: V3S16AuthorityContract,
  catalog: V3S16CatalogEvidence,
): V3S16ClassifiedFinding[] {
  const findings: V3S16ClassifiedFinding[] = [];
  for (const command of contract.canonicalCommands) {
    const bare = command.split(".").at(-1)!;
    const fn = catalog.functions.find((candidate) =>
      candidate.name === command || candidate.name === bare || candidate.name === `public.${bare}` || candidate.name === `private.${bare}`,
    );
    if (!fn) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_missing",
        subject: command,
        detail: `Declared canonical mutation command ${command} is absent from exact-SHA catalog evidence.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "declared_canonical_command_must_exist",
      });
      continue;
    }
    if (!fn.securityDefiner) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_not_security_definer",
        subject: command,
        detail: `Declared canonical mutation command ${command} is not SECURITY DEFINER.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "canonical_command_owns_revoked_table_boundary",
      });
    }
    if (!safeSearchPath(fn.searchPath)) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_unpinned_search_path",
        subject: command,
        detail: `Declared canonical mutation command ${command} lacks a pinned search_path containing pg_catalog.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "security_definer_search_path_must_be_pinned",
      });
    }
    if (fn.executeRoles.some((role) => role.toLowerCase() === "public")) {
      findings.push({
        domain: contract.domain,
        kind: "canonical_function_public_execute",
        subject: command,
        detail: `Declared canonical mutation command ${command} is executable by PUBLIC.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: contract.ownerBoundary ?? "shared",
        rule: "canonical_command_must_revoke_public_execute",
      });
    }
  }
  return findings;
}

export function classifyV3S16ReleaseAuthority(input: {
  baseFindings: readonly V3S16Finding[];
  domains: V3S16Report["domains"];
  files: readonly V3S16SourceFile[];
  catalog?: V3S16CatalogEvidence | null;
  staticOnly?: boolean;
}) {
  const findings: V3S16ClassifiedFinding[] = input.baseFindings.map(classifyBaseFinding);
  const contracts = new Map(V3_S16_AUTHORITY_CONTRACTS.map((contract) => [contract.domain, contract]));

  for (const domain of input.domains) {
    if (domain.ownerBoundary === "results_pr_1400") continue;
    const contract = contracts.get(domain.id);
    if (!contract?.canonicalCommands.length) {
      findings.push({
        domain: domain.id,
        kind: "canonical_command_inventory_missing",
        subject: domain.id,
        detail: `S16 has not yet declared the canonical mutation command inventory for ${domain.id}.`,
        releaseRisk: "hard_blocker",
        ownerBoundary: "shared",
        rule: "critical_mutation_owner_requires_explicit_command_inventory",
      });
      continue;
    }

    for (const legacy of contract.legacyApplicationWriters ?? []) {
      for (const file of productionFiles(input.files)) {
        legacy.pattern.lastIndex = 0;
        if (!legacy.pattern.test(file.source)) continue;
        findings.push({
          domain: domain.id,
          kind: "legacy_application_writer",
          subject: legacy.id,
          path: file.path,
          detail: legacy.rationale,
          releaseRisk: "hard_blocker",
          ownerBoundary: contract.ownerBoundary ?? "shared",
          rule: "legacy_application_writer_must_be_unreachable",
        });
      }
    }

    if (!input.staticOnly && input.catalog) {
      findings.push(...catalogCommandFindings(contract, input.catalog));
    }
  }

  const unique = [...new Map(findings.map((finding) => [
    [finding.domain, finding.kind, finding.subject, finding.path ?? "", finding.detail].join("\u0000"),
    finding,
  ])).values()];
  const hardBlockers = unique.filter((finding) => finding.releaseRisk === "hard_blocker").length;
  const conditionalBlockers = unique.filter((finding) => finding.releaseRisk === "conditional_blocker").length;
  return {
    findings: unique,
    riskTotals: {
      hard_blocker: hardBlockers,
      conditional_blocker: conditionalBlockers,
    },
    s16Passed: !input.staticOnly && unique.length === 0,
  };
}
