import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261021024500_v3_s6_jury_readiness_verifier_review_fixes.sql",
  ),
  "utf8",
);

function verifyBody() {
  const start = migration.indexOf(
    "create or replace function public.studio2_verify_jury_operational_projection(",
  );
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf("as $verify$", start);
  const end = migration.indexOf("$verify$;", bodyStart);
  expect(bodyStart).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(bodyStart);
  return migration.slice(start, end + "$verify$;".length);
}

describe("System V3 S6 Jury verifier review fixes", () => {
  it("registers an isolated forward-only S13 fix and embeds no hosted endpoint", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s6.jury-readiness-verifier-review-fix-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'\"]+\.supabase\.co/i);
  });

  it("bounds every Jury vote row before canonical projection recomputation", () => {
    const body = verifyBody();
    const allVoteBound = body.indexOf("into v_all_vote_rows");
    const evidenceGuard = body.indexOf(
      "greatest(v_all_vote_rows, v_submission_rows, v_status_rows) > p_evidence_limit",
    );
    const projectionRead = body.indexOf("private.studio2_result_preconditions(p_show_id)");

    expect(allVoteBound).toBeGreaterThanOrEqual(0);
    expect(body).toContain("from public.jury_votes vote");
    expect(body).toContain("limit p_evidence_limit + 1");
    expect(evidenceGuard).toBeGreaterThan(allVoteBound);
    expect(projectionRead).toBeGreaterThan(evidenceGuard);
    expect(body.slice(0, evidenceGuard)).not.toContain("submission.status = 'valid'\n      )\n    );");
  });

  it("derives valid-vote count only after the complete vote relation is proven bounded", () => {
    const body = verifyBody();
    const evidenceGuard = body.indexOf(
      "greatest(v_all_vote_rows, v_submission_rows, v_status_rows) > p_evidence_limit",
    );
    const validVoteCount = body.indexOf("into v_vote_rows", evidenceGuard);
    expect(validVoteCount).toBeGreaterThan(evidenceGuard);
    expect(body.slice(validVoteCount)).toContain("submission.status = 'valid'");
  });

  it("independently recomputes conflict and incomplete readiness inputs", () => {
    const body = verifyBody();
    const projectionRead = body.indexOf("private.studio2_result_preconditions(p_show_id)");
    const independentConflict = body.indexOf("into v_jury_conflicts, v_jury_incomplete");

    expect(independentConflict).toBeGreaterThanOrEqual(0);
    expect(independentConflict).toBeLessThan(projectionRead);
    expect(body).toContain("'jury_conflict_count_mismatch'");
    expect(body).toContain("'jury_incomplete_count_mismatch'");
    expect(body).toContain("and v_jury_conflicts = 0");
    expect(body).toContain("and v_jury_incomplete = 0");

    const readinessSection = body.slice(body.indexOf("v_expected_ready :="));
    expect(readinessSection).not.toContain("v_projection ->> 'juryConflictCount'");
    expect(readinessSection).not.toContain("v_projection ->> 'juryIncompleteCount'");
  });

  it("remains read-only and service-role-only", () => {
    const body = verifyBody();
    expect(body).toContain("stable");
    expect(body).not.toMatch(/\binsert\s+into\b/i);
    expect(body).not.toMatch(/\bupdate\s+[a-z0-9_.\"]+\s+set\b/i);
    expect(body).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).toContain(
      "revoke all on function public.studio2_verify_jury_operational_projection(uuid, integer, integer)",
    );
    expect(migration).toContain("to service_role;");
  });
});
