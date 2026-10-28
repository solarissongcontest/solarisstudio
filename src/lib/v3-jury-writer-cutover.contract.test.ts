import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");
describe("Jury command-only mutation boundary", () => {
  it("removes direct mutation and peer ballot execution while pinning internal resolution", () => {
    const migration = read("supabase/migrations/20261028113611_v3_jury_direct_write_cutover.sql");
    for (const table of ["jury_voting_windows", "jury_ballot_submissions", "jury_votes", "studio2_jury_window_versions"]) expect(migration).toContain(`public.${table}`);
    expect(migration).toContain("revoke insert,update,delete,truncate");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).toContain("revoke all on function public.submit_country_jury_ballot(uuid,jsonb,uuid)");
    expect(migration).toContain("set search_path = pg_catalog,public,televoting");
  });
  it("checks actual grants, canonical call graph and denied legacy/service writes in PostgreSQL", () => {
    const sql = read(".github/tests/v3-jury-writer-cutover.sql");
    for (const proof of ["has_table_privilege", "has_function_privilege", "proowner='postgres'::regrole", "pg_get_functiondef", "Legacy ballot bypass accepted", "Raw Jury vote delete accepted", "Raw Jury window version overwrite accepted"]) expect(sql).toContain(proof);
    expect(read(".github/scripts/v3-canonical-writer-rehearsal.sh")).toContain("v3-jury-writer-cutover.sql");
  });
});
