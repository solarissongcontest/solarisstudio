import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261027215500_v3_show_definition_permission_cutover.sql"),
  "utf8",
);

describe("V3 show definition permission cutover", () => {
  it("uses Permission Engine capability authority without legacy role fallback", () => {
    expect(migration).toContain("private.studio2_user_has_capability(v_actor, 'edition.manage', p_edition_id)");
    expect(migration.split("as $auth$")[1].split("$auth$;")[0]).not.toContain("public.has_role");
  });

  it("keeps the private authorization helper inaccessible to API roles", () => {
    expect(migration).toContain("revoke all on function private.v3_require_show_definition_manager(uuid)");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });
});
