import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_televoting_rounds_overview_cutover.sql"),
);
if (!migrationName) throw new Error("televoting rounds overview cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("televoting rounds overview Permission Engine cutover", () => {
  it("moves the read-only rounds overview to non-strict edition-scoped voting.read", () => {
    expect(migration).toContain("public.studio2_access_allowed('voting.read', p_solaris_edition_id, false)");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).not.toContain("has_role");
  });

  it("preserves the merged edition and round payload", () => {
    const sql = normalized(migration);
    expect(sql).toContain("from public.editions e where e.id = p_solaris_edition_id");
    expect(sql).toContain("left join public.integration_links il on il.service = 'televoting'");
    expect(sql).toContain("left join televoting.editions te on te.id::text = il.remote_id");
    expect(sql).toContain("join televoting.rounds r on r.edition_id = rm.remote_id");
    expect(sql).toContain("left join televoting.round_entries re on re.round_id = r.id");
    expect(sql).toContain("'entry_count', entry_count");
  });

  it("keeps the RPC authenticated-only and excludes anonymous/service direct execution", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "revoke execute on function televoting.admin_rounds_page_overview(uuid) from public, anon, service_role;",
    );
    expect(sql).toContain(
      "grant execute on function televoting.admin_rounds_page_overview(uuid) to authenticated;",
    );
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
