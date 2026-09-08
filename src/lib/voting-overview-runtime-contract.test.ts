import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Voting organizer overview runtime contract", () => {
  it("loads the overview through one edition-aware database RPC", () => {
    const loader = source("integrations/televoting/admin-data.functions.ts");

    expect(loader).toContain('createServerFn({ method: "POST" })');
    expect(loader).toContain('"admin_overview_summary"');
    expect(loader).toContain("p_solaris_edition_id: data.editionId");
    expect(loader).not.toContain('.from("rounds")');
    expect(loader).not.toContain("maybeSingle()");
  });

  it("follows the Organizer edition context without a separate backend probe", () => {
    const page = source("routes/televoting/admin/index.tsx");

    expect(page).toContain("useAdminContext");
    expect(page).toContain('["merged-televoting-admin-overview", editionId]');
    expect(page).toContain("getOverview({ data: { editionId } })");
    expect(page).not.toContain("getMergedTelevotingServerStatus");
  });

  it("keeps the database summary invoker-scoped and repairs legacy active projections", () => {
    const migration = source("../supabase/migrations/20260908185215_add_televoting_admin_overview_summary.sql");

    expect(migration).toContain("security invoker");
    expect(migration).toContain("revoke execute on function televoting.admin_overview_summary(uuid) from public, anon");
    expect(migration).toContain("with current_remote as");
    expect(migration).toContain("order by pe.edition_number desc");
  });
});
