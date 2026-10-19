import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018031000_v3_http409_deterministic_conflicts.sql",
  ),
  "utf8",
);

const deterministicFunctions = [
  "studio2_apply_confirmation_round_change",
  "studio2_apply_confirmation_winner_change",
  "studio2_apply_eligibility_override_change",
  "studio2_apply_jury_ballot_review",
  "studio2_apply_jury_dnv",
  "studio2_apply_jury_voting_status",
  "studio2_apply_next_in_line_window_change",
  "studio2_apply_participation_status",
  "studio2_apply_permission_change",
  "studio2_apply_platform_mode_change",
  "studio2_apply_show_publication_change",
  "studio2_apply_voting_declaration_invalidation",
  "studio2_approve_permission_change",
  "studio2_approve_transition",
  "studio2_delete_prediction_round",
  "studio2_execute_host_operation",
  "studio2_execute_result_operation",
  "studio2_execute_story_operation",
  "studio2_record_platform_exit_preflight",
  "studio2_request_permission_change_approval",
  "studio2_review_media_assets_legacy_impl",
  "studio2_save_broadcast_rundown",
  "studio2_save_prediction_round",
  "studio2_score_prediction_round",
  "studio2_set_broadcast_rundown_lock",
  "studio2_transition_broadcast_segment",
  "studio2_apply_round_deadline_change",
  "studio2_apply_round_status_change",
] as const;

describe("System V3 deterministic conflict HTTP transport", () => {
  it("uses an explicit function allowlist rather than rewriting every 40001 in the database", () => {
    for (const functionName of deterministicFunctions) {
      expect(migration).toContain(functionName);
    }
    expect(migration).toContain("v_signatures constant text[]");
    expect(migration).toContain("to_regprocedure(v_signature)");
    expect(migration).not.toContain("from pg_proc");
    expect(migration).not.toContain("from pg_namespace");
  });

  it("rewrites only the deterministic conflict SQLSTATE to PostgREST HTTP 409", () => {
    expect(migration).toContain("pg_get_functiondef(v_function::oid)");
    expect(migration).toContain(
      "replace(v_definition, '''40001''', '''PT409''')",
    );
    expect(migration).toContain(
      "Expected deterministic SQLSTATE 40001 was not found",
    );
    expect(migration).toContain("HTTP 409 SQLSTATE was not installed");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("fails closed inside one transaction if the live function catalog no longer matches the allowlist", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
    expect(migration).toContain("if v_function is null then");
    expect(migration).toContain("Missing deterministic-conflict function");
    expect(migration).toContain("review the allowlist instead of silently skipping it");
    expect(migration).toContain("Function identity changed while normalizing");
  });

  it("keeps genuine DomainEvent worker lease conflicts on serialization retry semantics", () => {
    expect(migration).toContain("studio2_complete_domain_event_delivery");
    expect(migration).toContain(
      "DomainEvent delivery lease conflicts no longer retain genuine serialization retry semantics",
    );
    expect(migration).not.toContain(
      "'public.studio2_process_confirmation_domain_event(uuid,text,text)'",
    );
    expect(migration).not.toContain(
      "'public.studio2_process_entry_domain_event(uuid,text,text)'",
    );
    expect(migration).not.toContain(
      "'public.studio2_process_jury_domain_event(uuid,text,text)'",
    );
  });

  it("stays stacked after the focused Entry-review PT409 migration instead of duplicating it", () => {
    expect(migration).not.toContain(
      "public.studio2_apply_confirmation_entry_review(uuid,text,text,text,uuid,text,bigint,uuid,uuid)",
    );
    const entryReviewMigration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261018024500_v3_entry_review_conflict_http409.sql",
      ),
      "utf8",
    );
    expect(entryReviewMigration).toContain("PT409");
    expect(entryReviewMigration).toContain("VERSION_CONFLICT");
  });
});