import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_public_legacy_rls_cutover.sql"),
);
if (!migrationName) throw new Error("Public legacy RLS cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Public-schema Permission Engine legacy RLS cutover", () => {
  it("recreates all sixteen remaining public legacy policies without has_role", () => {
    for (const policy of [
      "Organizers can read admin beta feedback",
      "Organizers can submit admin beta feedback",
      "Organizers manage deadlines",
      "Organizers read own notifications",
      "Organizers update own notifications",
      "Organizers manage own admin preferences",
      "Organizers can read Beta 2 feedback",
      "Organizers can read beta feedback",
      "organizers manage content events",
      "edit_tokens_organizer_all",
      "integration events organizer only",
      "integration links organizer only",
      "internal_entries_organizer_all",
      "televoting round bindings organizer only",
      "themes organizer write",
      "themes public read",
    ]) {
      expect(migration).toContain(`drop policy if exists \"${policy}\"`);
      expect(migration).toContain(`create policy \"${policy}\"`);
    }
    expect(migration).not.toContain("has_role(");
  });

  it("keeps beta feedback on elevated rollout.manage", () => {
    expect(migration.match(/studio2_access_allowed\('rollout\.manage', null, false\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).not.toContain("'rollout.read'");
  });

  it("makes deadlines edition/show/global scoped with edition.manage", () => {
    const sql = normalized(migration);
    expect(sql).toContain("when edition_id is not null then public.studio2_access_allowed('edition.manage', edition_id, false)");
    expect(sql).toContain("when show_id is not null then private.studio2_show_access_allowed('edition.manage', show_id, false)");
    expect(sql).toContain("else public.studio2_access_allowed('edition.manage', null, false)");
  });

  it("preserves ownership on personal admin notifications and preferences", () => {
    const sql = normalized(migration);
    expect(sql).toContain("recipient_id = auth.uid() and public.studio2_access_allowed('edition.manage', null, false)");
    expect(sql).toContain("user_id = auth.uid() and public.studio2_access_allowed('edition.manage', null, false)");
  });

  it("uses publishing.manage for content events", () => {
    expect(migration).toContain("public.studio2_access_allowed('publishing.manage', null, false)");
  });

  it("resolves submission edition scope for internal entry administration", () => {
    const sql = normalized(migration);
    expect(sql).toContain("create or replace function private.studio2_submission_access_allowed");
    expect(sql).toContain("from public.submissions s where s.id = p_submission_id");
    expect(sql).toContain("private.studio2_submission_access_allowed('entry.approve', submission_id, false)");
    expect(sql).toContain(
      "grant execute on function private.studio2_submission_access_allowed(text, uuid, boolean) to authenticated;",
    );
    expect(sql).toContain(
      "revoke all on function private.studio2_submission_access_allowed(text, uuid, boolean) from public, anon, service_role;",
    );
  });

  it("uses edition.manage for integration plumbing and voting.manage for canonical round bindings", () => {
    const sql = normalized(migration);
    expect(sql).toContain("public.studio2_access_allowed('edition.manage', edition_id, false)");
    expect(sql).toContain("public.studio2_access_allowed('voting.manage', edition_id, false)");
  });

  it("preserves public theme reads and guards the elevated branch behind authentication", () => {
    const sql = normalized(migration);
    expect(sql).toContain("is_public or exists ( select 1 from public.shows s where s.theme_id = themes.id and s.published = true )");
    expect(sql).toContain("or exists ( select 1 from public.editions e where e.theme_id = themes.id and e.published = true )");
    expect(sql).toContain("auth.uid() is not null and public.studio2_access_allowed('edition.manage', null, false)");
  });

  it("fails the migration if any public legacy policy debt survives", () => {
    const sql = normalized(migration);
    expect(sql).toContain("where schemaname = 'public'");
    expect(sql).toContain("if v_remaining <> 0 then raise exception 'public legacy role policy debt remains after Batch 22: %', v_remaining;");
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
