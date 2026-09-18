import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_rls_initplan_and_duplicate_index_cleanup.sql"),
);
if (!migrationName) throw new Error("RLS performance cleanup migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

describe("RLS init-plan and duplicate-index cleanup", () => {
  it("targets the fourteen remaining live auth.uid RLS warnings", () => {
    for (const policy of [
      "read own roles",
      "country accounts read own",
      "Fans can read own taste ballots",
      "Fans can insert own taste ballots",
      "Fans can update own taste ballots",
      "Fans can delete own taste ballots",
      "studio2_delegation_settings_capability_read",
      "studio2_jury_members_capability_read",
      "participants unreleased owner or capability read",
      "studio2_notice_receipts_capability_read",
      "Organizers read own notifications",
      "Organizers update own notifications",
      "Organizers manage own admin preferences",
      "themes public read",
    ]) {
      expect(migration).toContain(policy);
    }
  });

  it("preserves policy expressions and only wraps auth.uid in a scalar select", () => {
    expect(migration).toContain("replace(v_policy.qual, 'auth.uid()', '(select auth.uid())')");
    expect(migration).toContain("replace(v_policy.with_check, 'auth.uid()', '(select auth.uid())')");
    expect(migration).toContain("alter policy %I on %I.%I");
  });

  it("treats production-only legacy admin policies as optional on clean replay", () => {
    expect(migration).toContain("('public','admin_notifications','Organizers read own notifications', false)");
    expect(migration).toContain("('public','admin_preferences','Organizers manage own admin preferences', false)");
    expect(migration).toContain("if v_target.required then");
    expect(migration).toContain("continue;");
  });

  it("drops only the duplicate audit index and preserves the canonical one", () => {
    expect(migration).toContain("drop index if exists public.admin_audit_created_idx");
    expect(migration).toContain("to_regclass('public.admin_audit_log_created_at_idx')");
  });
});
