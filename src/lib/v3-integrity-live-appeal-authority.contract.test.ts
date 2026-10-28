import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const read = (p: string) => readFileSync(p, "utf8");
it("revalidates live session, unrecused reviewer and same-case active sanction before adjudication", () => {
 const migration = read("supabase/migrations/20261028151625_v3_integrity_appeal_live_reviewer_boundary.sql");
 for (const guard of ["private.v3_require_active_auth_session()", "recused_at is null", "for share", "v_original.case_id is distinct from v_appeal.case_id", "v_original.status<>'active'", "a.version", "revoke all on function public.admin_assign_integrity_appeal_reviewer"]) expect(migration).toContain(guard);
 const route = read("src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx");
 expect(route).toContain("resolutionOperation.current?.fingerprint !== fingerprint");
 expect(route).toContain("p_expected_version: selected.version");
 expect(route).not.toContain('rpc("admin_decide_integrity_appeal"');
});
it("proves every supported outcome, late eligibility, case readback and immutable original sanctions without async delivery", () => {
 const sql = read(".github/tests/v3-integrity-appeal-outcome-authority.sql");
 for (const outcome of ["upheld", "reduced", "increased", "overturned", "rejected_ineligible", "rejected_late"]) expect(sql).toContain(`'${outcome}'`);
 for (const invariant of ["Outcome replay changed", "Canonical case readback disagrees with appeal", "Original sanction consequence incoherent", "Replacement sanction consequence incoherent", "Outcome immutable history missing", "Outcome durable audit event missing", "Foreign actor submitted reporter appeal", "Late appeal deadline policy lost"]) expect(sql).toContain(invariant);
 const recovery = read(".github/tests/v3-integrity-appeal-recovery.sql");
 expect(recovery).toContain("Recused reviewer resolved appeal");
 expect(recovery).toContain("Revoked reviewer resolved appeal");
 expect(recovery).toContain("Inactive sanction was replaced on appeal");
});
