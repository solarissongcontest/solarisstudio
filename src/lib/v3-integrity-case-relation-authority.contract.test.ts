import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");
describe("Integrity relation canonical command", () => {
  it("uses exact relation CAS in addition to case revision and ordered locks", () => {
    const sql = read("supabase/migrations/20261028120000_v3_integrity_case_relation_authority.sql");
    for (const invariant of ["private.v3_require_active_auth_session()", "studio2_access_allowed('integrity.manage',null,false)", "order by id for update", "v_case.version<>p_expected_case_version", "v_before.id is distinct from p_expected_relation_id", "v_before.note is distinct from p_expected_note", "private.studio2_claim_operation", "private.studio2_complete_operation", "'previous'", "'next'", "drop function public.admin_link_integrity_cases"]) expect(sql).toContain(invariant);
    expect(sql.indexOf("v_claim->'result'")).toBeLessThan(sql.indexOf("order by id for update"));
  });
  it("keeps the reviewed operation unchanged across transport ambiguity", () => {
    const route = read("src/routes/_authenticated/admin/integrity-case.$caseId.tsx");
    expect(route).toContain('rpc("studio2_integrity_link_cases", pendingOperation.current.args)');
    expect(route).toContain("p_expected_relation_id: previous?.id ?? null");
    expect(route).toContain("p_expected_note: previous?.note ?? null");
    expect(route).toContain("pendingOperation.current?.fingerprint !== fingerprint");
    expect(route).not.toContain('rpc("admin_link_integrity_cases"');
  });
  it("requires PostgreSQL replay, conflict, unauthorized actor, raw DML and durable provenance proofs", () => {
    const sql = read(".github/tests/v3-integrity-case-relation-authority.sql");
    for (const proof of ["Relation receipt replay diverged", "Changed relation operation accepted", "Stale relation overwrote canonical note", "Stale case revision accepted", "Foreign actor linked cases", "Relation provenance missing or duplicated", "Raw service relation note overwrite accepted"]) expect(sql).toContain(proof);
    expect(read(".github/scripts/v3-canonical-writer-rehearsal.sh")).toContain("v3-integrity-case-relation-authority.sql");
  });
});
