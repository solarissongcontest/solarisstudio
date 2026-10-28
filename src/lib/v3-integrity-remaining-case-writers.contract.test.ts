import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027215501_v3_integrity_remaining_case_writer_cutover.sql"),
  "utf8",
);
const revision = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027220500_v3_integrity_case_revision_completeness.sql"),
  "utf8",
);
const s16 = readFileSync(resolve(process.cwd(), "src/lib/v3-s16-mutation-authority.ts"), "utf8");

describe("V3 Integrity remaining case writer cutover", () => {
  it("governs recusal, note, pre-clearance and retention operations", () => {
    for (const command of [
      "studio2_integrity_recuse_case_reviewer",
      "studio2_integrity_add_case_note",
      "studio2_integrity_record_preclearance_ruling",
      "studio2_integrity_set_case_retention",
    ]) {
      expect(migration).toContain(`function public.${command}`);
      expect(s16).toContain(`public.${command}`);
    }
    expect(migration.match(/private\.studio2_claim_operation/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/private\.studio2_complete_operation/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("retires direct EXECUTE authority on mature implementation primitives", () => {
    for (const implementation of [
      "admin_recuse_from_integrity_case_impl",
      "admin_add_integrity_case_note_impl",
      "admin_record_integrity_preclearance_ruling_impl",
      "admin_set_integrity_case_retention_impl",
    ]) {
      expect(migration).toContain(`function public.${implementation}`);
      expect(s16).toContain(`public.${implementation}`);
    }
    expect(migration.match(/from public, anon, authenticated, service_role/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("documents every retained Organizer compatibility alias with a sunset", () => {
    expect(migration.match(/TEMPORARY COMPATIBILITY PATH/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration.match(/Sunset:/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("treats retention as revisioned case state for stale-write safety", () => {
    expect(revision).toContain("old.retention_until is distinct from new.retention_until");
    expect(revision).toContain("'retentionUntil', old.retention_until");
    expect(revision).toContain("'retentionUntil', new.retention_until");
    expect(revision).toContain("'integrity.case_changed'");
  });
});
