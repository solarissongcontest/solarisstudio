// Rebased onto the authoritative Permission Engine mainline.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_security_definer_execute_hardening.sql"),
);
if (!migrationName) throw new Error("SECURITY DEFINER hardening migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

describe("SECURITY DEFINER execution hardening", () => {
  it("removes direct API execution from trigger-only helpers", () => {
    for (const fn of [
      "append_running_order_for_new_participant",
      "compact_running_order_after_delete",
      "materialize_results_on_show_publish",
      "rerank_results_after_voting_config_change",
      "sync_edition_palette_after_change",
      "sync_qualifiers_after_result_change",
      "sync_qualifiers_after_show_change",
      "sync_results_after_participant_change",
      "sync_results_after_vote_change",
      "round_entries_sync_countries",
    ]) {
      expect(migration).toContain(fn);
    }
    expect(migration).toContain("Trigger helper still directly executable");
  });

  it("keeps internal helper execution service-role only", () => {
    for (const fn of [
      "can_edit_submission",
      "find_entry_duplicate",
      "generate_recovery_code",
      "integrity_can_upload_evidence",
      "is_trusted_submission_browser",
      "materialize_show_results_if_missing",
      "refresh_edition_qualifications",
      "refresh_show_qualifiers",
      "sync_edition_palette_to_linked_themes",
      "sync_show_results_from_votes",
    ]) {
      expect(migration).toContain(fn);
    }
    expect(migration).toContain("'grant execute on function %s to service_role'");
    expect(migration).toContain("to_regprocedure(v_signature) is not null");
    expect(migration).toContain("Internal helper privilege boundary invalid");
  });

  it("does not revoke the deliberate anonymous public API surface", () => {
    expect(migration).not.toContain("public_create_anonymous_integrity_case");
    expect(migration).not.toContain("public_current_rulebook_release");
    expect(migration).not.toContain("submit_confirmation");
    expect(migration).not.toContain("submit_vote_checked");
  });
});
