import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read = (p: string) => readFileSync(p, "utf8");
it("routes Organizer evidence through a live, versioned, replayable command and removes the peer RPC", () => {
 const sql = read("supabase/migrations/20261028150032_v3_integrity_register_evidence_authority.sql");
 for (const invariant of ["private.v3_require_active_auth_session()", "studio2_access_allowed('integrity.manage',null,false)", "for update", "v_case.version<>p_expected_case_version", "private.studio2_claim_operation", "private.studio2_complete_operation", "drop function public.admin_register_integrity_evidence"]) expect(sql).toContain(invariant);
 expect(sql.indexOf("v_claim->'result'")).toBeLessThan(sql.indexOf("for update"));
 const route = read("src/routes/_authenticated/admin/integrity-case.$caseId.tsx");
 expect(route).toContain('rpc("studio2_integrity_register_evidence", pendingEvidenceOperation.current.args)');
 expect(route).toContain("p_expected_case_version: detail.case.version");
 expect(route).not.toContain('rpc("admin_register_integrity_evidence"');
});
it("retains positive evidence behavior and exact authorization/concurrency negative tests in PostgreSQL", () => {
 const sql = read(".github/tests/v3-integrity-register-evidence-authority.sql");
 for (const proof of ["Evidence lost-response recovery diverged", "Evidence request conflict accepted", "Stale case evidence accepted", "Unauthorized reporter registered Organizer evidence", "Revoked session replayed evidence receipt", "Evidence provenance missing or duplicated", "Unexpected evidence command EXECUTE"]) expect(sql).toContain(proof);
 expect(read(".github/scripts/v3-canonical-writer-rehearsal.sh")).toContain("v3-integrity-register-evidence-authority.sql");
});
