import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path,"utf8");
describe("Integrity appeal reviewer authority and recovery", () => {
  it("uses canonical capability and live session while preserving reviewer separation and CAS", () => {
    const migration=read("supabase/migrations/20261028111828_v3_integrity_appeal_reviewer_authority.sql");
    const body=migration.split("as $assign$")[1].split("$assign$;")[0];
    expect(body).not.toContain("public.user_roles");
    for (const invariant of ["private.v3_require_active_auth_session()","private.studio2_user_has_capability(p_user_id,'integrity.sanction',null)","for update","v_appeal.version <> p_expected_version","v_appeal.status not in ('submitted','under_review')","p_user_id=v_appeal.submitted_by_user_id","p_user_id=v_sanction_creator","p_user_id=v_finding_creator","s.case_id=v_appeal.case_id","private.studio2_complete_operation"]) expect(body).toContain(invariant);
  });
  it("runs canonical submit, changed-request, duplicate, stale-review, outcome and immutable-history proofs", () => {
    const sql=read(".github/tests/v3-integrity-appeal-recovery.sql");
    for (const proof of ["public.v3_submit_integrity_appeal(","Changed submit request accepted","Duplicate sanction appeal accepted","Original decision-maker became reviewer","Unassigned reviewer resolved appeal","Stale appeal revision accepted","Lost-response replay diverged","Changed resolution request accepted","Terminal appeal was reassigned","Original adjudication rewritten","Durable resolution event missing","Committed resolution readback missing","Adjudication history mutable"]) expect(sql).toContain(proof);
    expect(read(".github/scripts/v3-canonical-writer-rehearsal.sh")).toContain("v3-integrity-appeal-recovery.sql");
  });
});
