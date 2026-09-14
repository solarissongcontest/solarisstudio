import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_core_rls_cutover.sql"),
);

if (!migrationName) throw new Error("Permission Engine v2 core cutover migration is missing");

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
);

function policyBlock(name: string) {
  const start = migration.indexOf(`create policy \"${name}\"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create policy", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("Permission Engine v2 core cutover", () => {
  it("only treats the engine as authoritative when rollout is globally enabled", () => {
    expect(migration).toContain("private.studio2_permission_engine_authoritative()");
    expect(migration).toContain("f.key = 'permission_engine_v2'");
    expect(migration).toContain("f.enabled");
    expect(migration).toContain("not f.admins_only");
    expect(migration).toContain("cardinality(coalesce(f.user_ids, '{}'::uuid[])) = 0");
    expect(migration).toContain("cardinality(coalesce(f.edition_ids, '{}'::uuid[])) = 0");
  });

  it("persists legacy operators before removing the legacy capability fallback", () => {
    expect(migration).toContain("insert into public.studio2_role_assignments");
    expect(migration).toContain("from public.user_roles ur");
    expect(migration).toContain("where ur.role::text in ('organizer', 'viewer')");
    expect(migration).toContain("not private.studio2_permission_engine_authoritative()");
    expect(migration).toContain("join public.studio2_role_capabilities rc on rc.role_key = ur.role::text");
  });

  it("uses one cutover-aware predicate for pre-cutover dual checks and authoritative capability checks", () => {
    expect(migration).toContain("function public.studio2_access_allowed");
    expect(migration).toContain("if private.studio2_permission_engine_authoritative() then");
    expect(migration).toContain("return v_capability_allowed;");
    expect(migration).toContain("if p_strict_before_cutover then");
    expect(migration).toContain("return v_legacy_allowed and v_capability_allowed;");
    expect(migration).toContain("return v_legacy_allowed or v_capability_allowed;");
  });

  it("makes the existing strict-dual trigger helper capability-authoritative after cutover", () => {
    const start = migration.indexOf("function private.studio2_require_strict_dual");
    const block = migration.slice(start, migration.indexOf("-- CORE EDITION", start));
    expect(block).toContain("private.studio2_permission_engine_authoritative()");
    expect(block).toContain("private.studio2_user_has_capability");
    expect(block).toContain("public.studio2_check_capability_shadow");
  });

  it("moves core write policies to strict capability-aware decisions", () => {
    const expectations: Array<[string, string]> = [
      ["editions capability write", "edition.manage"],
      ["shows capability write", "edition.manage"],
      ["contest entities capability write", "edition.manage"],
      ["entries capability write", "entry.edit"],
      ["participants capability write", "entry.edit"],
      ["jury votes capability write", "jury.ballots.manage"],
      ["televote capability write", "televote.ballots.manage"],
      ["voters capability write", "voting.manage"],
      ["results capability write", "results.verify"],
      ["capability can manage jury voting windows", "voting.manage"],
      ["jury ballot statuses capability access", "jury.ballots.manage"],
      ["capability can manage hod assignments", "delegation.manage"],
      ["capability can manage hod people", "delegation.manage"],
    ];

    for (const [policy, capability] of expectations) {
      const block = policyBlock(policy);
      expect(block).toContain(`'${capability}'`);
      expect(block).toContain("true");
      expect(block).not.toContain("has_role");
    }
  });

  it("moves protected reads away from direct Organizer-role checks", () => {
    const expectations: Array<[string, string]> = [
      ["editions public or capability read", "edition.read"],
      ["shows public or capability read", "edition.read"],
      ["entries public or capability read", "entry.read_private"],
      ["results public or capability read", "results.preview"],
      ["jury public or capability read", "jury.ballots.read"],
      ["televote public or capability read", "televote.ballots.read"],
      ["voters public or capability read", "voting.read"],
      ["studio2_contest_events_capability_read", "edition.read"],
      ["studio2_edition_runtime_capability_read", "edition.read"],
      ["studio2_feature_flags_capability_read", "rollout.read"],
      ["studio2_transition_approval_capability_read", "edition.manage"],
    ];

    for (const [policy, capability] of expectations) {
      const block = policyBlock(policy);
      expect(block).toContain(`'${capability}'`);
      expect(block).toContain("public.studio2_access_allowed");
      expect(block).not.toContain("has_role");
    }
  });

  it("keeps delegation ownership independent from Organizer capability access", () => {
    expect(policyBlock("studio2_delegation_settings_capability_read")).toContain(
      "public.owns_country(auth.uid(), country_id)",
    );
    expect(policyBlock("studio2_jury_members_capability_read")).toContain(
      "public.owns_country(auth.uid(), country_id)",
    );
  });

  it("moves legacy role administration behind permissions capabilities", () => {
    expect(policyBlock("capability managers grant legacy roles")).toContain("permissions.manage");
    expect(policyBlock("capability managers read legacy roles")).toContain("permissions.read");
    expect(policyBlock("capability auditors read audit log")).toContain("permissions.audit");
  });
});
