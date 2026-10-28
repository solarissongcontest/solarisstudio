import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanV3S16StaticAuthority } from "./v3-s16-mutation-authority";
const read = (path: string) => readFileSync(path, "utf8");
describe("Integrity evidence writer cutover", () => {
  it("retains only credential-checking reporter wrappers over the inaccessible token primitive", () => {
    const migration = read("supabase/migrations/20261028111146_v3_integrity_evidence_write_boundary.sql");
    expect(migration).toContain("revoke insert, update, delete, truncate on public.integrity_case_evidence");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    const vault = read("supabase/migrations/20260910213300_integrity_evidence_vault.sql");
    const protectedWrapper = vault.split("create or replace function public.finalize_protected_evidence(")[1];
    expect(protectedWrapper).toContain("reporter_user_id = auth.uid()");
    expect(protectedWrapper).toContain("integrity_finalize_evidence_token(_token_id, _case_id, auth.uid())");
    expect(vault).toContain("integrity_finalize_evidence_token(_token_id, v_case, null)");
    expect(vault).toContain("extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key)");
  });
  it("proves grants, actual denial, attachment, lineage and supported finalization in PostgreSQL", () => {
    const sql = read(".github/tests/v3-integrity-evidence-write-boundary.sql");
    for (const proof of ["Raw service evidence TRUNCATE accepted", "Service actor forgery primitive accepted", "Foreign lineage was accepted", "retention_until", "tgtype=7", "tgtype=23", "has_function_privilege", "public.finalize_protected_evidence("]) expect(sql).toContain(proof);
    expect(read(".github/scripts/v3-canonical-writer-rehearsal.sh")).toContain("v3-integrity-evidence-write-boundary.sql");
  });
  it("still rejects an unknown application evidence writer", () => {
    expect(scanV3S16StaticAuthority([{path:"src/unknown-evidence-writer.ts",source:'client.from("integrity_case_evidence").insert({title:"bypass"});'}])).toContainEqual(expect.objectContaining({domain:"integrity",kind:"direct_application_writer",releaseRisk:"hard_blocker"}));
  });
});
