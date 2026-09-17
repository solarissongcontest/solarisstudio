import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_prediction_rls_cutover.sql"),
);
if (!migrationName) throw new Error("Prediction Arena RLS cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Prediction Arena Permission Engine RLS cutover", () => {
  it("adds a private show-to-edition capability resolver", () => {
    const sql = normalized(migration);
    expect(sql).toContain("create or replace function private.studio2_show_access_allowed");
    expect(sql).toContain("security definer");
    expect(sql).toContain("from public.shows s where s.id = p_show_id");
    expect(sql).toContain("public.studio2_access_allowed( p_capability, s.edition_id, p_strict_before_cutover )");
    expect(sql).toContain(
      "revoke all on function private.studio2_show_access_allowed(text, uuid, boolean) from public, anon, authenticated, service_role;",
    );
  });

  it("moves Prediction round management to non-strict voting.manage", () => {
    const sql = normalized(migration);
    expect(sql).toContain('drop policy if exists "organizers manage prediction rounds" on public.prediction_rounds;');
    expect(sql).toContain('create policy "organizers manage prediction rounds" on public.prediction_rounds for all to authenticated');
    expect(sql).toContain("private.studio2_show_access_allowed('voting.manage', show_id, false)");
    expect(migration).not.toContain("has_role(");
  });

  it("preserves public published-round visibility while replacing only the elevated bypass", () => {
    const sql = normalized(migration);
    expect(sql).toContain('create policy "public reads published prediction rounds" on public.prediction_rounds for select to anon, authenticated');
    expect(sql).toContain("status = any (array['open'::text, 'locked'::text, 'scoring'::text, 'scored'::text])");
    expect(sql).toContain("public.show_publication_enabled(show_id, 'participants'::text)");
    expect(sql).toContain("or private.studio2_show_access_allowed('voting.manage', show_id, false)");
  });

  it("does not broaden unpublished visibility to read-only capabilities", () => {
    expect(migration).not.toContain("'voting.read'");
    expect(migration).not.toContain("'edition.read'");
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
