import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_communications_helper_cutover.sql"),
);
if (!migrationName) throw new Error("communications helper cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(qualifiedName: string) {
  const marker = `create or replace function ${qualifiedName}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("communications helper Permission Engine cutover", () => {
  it("moves communications management to non-strict communications.send", () => {
    const fn = block("public.studio2_can_manage_communications");
    expect(fn).toContain("auth.uid() is not null");
    expect(fn).toContain("studio2_access_allowed('communications.send', p_edition_id, false)");
    expect(fn).not.toContain("has_role");
  });

  it("moves notice staff visibility to non-strict communications.send", () => {
    const fn = block("public.studio2_can_read_notice");
    expect(fn).toContain("when auth.uid() is null then false");
    expect(fn).toContain(
      "when public.studio2_access_allowed('communications.send', p_edition_id, false) then true",
    );
    expect(fn).not.toContain("has_role");
  });

  it("preserves the published-recipient fallback", () => {
    const fn = block("public.studio2_can_read_notice");
    expect(fn).toContain("p_status = 'published' and p_sent_at is not null");
    expect(fn).toContain("private.studio2_user_can_receive_notice_v2(");
    expect(fn).toContain("coalesce(p_country_ids, '{}'::uuid[])");
    expect(fn).toContain("p_audience_group");
  });

  it("keeps both helpers authenticated/service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_can_manage_communications(uuid) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_can_manage_communications(uuid) to authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_can_read_notice(uuid, text, timestamptz, text, uuid[], text) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_can_read_notice(uuid, text, timestamptz, text, uuid[], text) to authenticated, service_role;",
    );
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
