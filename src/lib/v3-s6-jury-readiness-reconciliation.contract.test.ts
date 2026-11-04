import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019211000_v3_s6_jury_readiness_reconciliation.sql",
  ),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s6-jury-readiness-rehearsal.sh"),
  "utf8",
);

function functionBody(name: string) {
  const marker = `create or replace function public.${name}(`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("\ncreate or replace function public.", start + marker.length);
  const revoke = migration.indexOf("\nrevoke all on function", start + marker.length);
  const endCandidates = [next, revoke].filter((value) => value > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : migration.length;
  return migration.slice(start, end);
}

describe("System V3 S6 Jury operational-readiness reconciliation", () => {
  it("declares an S13 forward-only migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s6.jury-readiness-reconciliation'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("rebuilds the disposable readiness projection by canonical read recomputation only", () => {
    const rebuild = functionBody("studio2_rebuild_jury_operational_projection");
    expect(rebuild).toContain("private.studio2_result_preconditions(p_show_id)");
    expect(rebuild).toContain("'state', 'recomputed'");
    expect(rebuild).toContain("'canonical_read_recompute'");
    expect(rebuild).not.toMatch(/\binsert\s+into\s+public\.jury_/i);
    expect(rebuild).not.toMatch(/\bupdate\s+public\.jury_/i);
    expect(rebuild).not.toMatch(/\bdelete\s+from\s+public\.jury_/i);
    expect(rebuild).not.toContain("sync_show_results_from_votes");
    expect(rebuild).not.toContain("materialize_show_results_if_missing");
  });

  it("fails honestly when voter or evidence bounds are exceeded", () => {
    const rebuild = functionBody("studio2_rebuild_jury_operational_projection");
    expect(rebuild).toContain("p_voter_limit > 500");
    expect(rebuild).toContain("p_evidence_limit > 10000");
    expect(rebuild).toContain("limit p_voter_limit + 1");
    expect(rebuild).toContain("limit p_evidence_limit + 1");
    expect(rebuild).toContain("'voter_bound_exceeded'");
    expect(rebuild).toContain("'evidence_bound_exceeded'");
    expect(rebuild.indexOf("'evidence_bound_exceeded'")).toBeLessThan(
      rebuild.indexOf("private.studio2_result_preconditions(p_show_id)"),
    );
  });

  it("verifies canonical Jury evidence independently before declaring consistency", () => {
    const verify = functionBody("studio2_verify_jury_operational_projection");
    expect(verify).toContain("from public.voters voter");
    expect(verify).toContain("from public.participants participant");
    expect(verify).toContain("from public.jury_votes vote");
    expect(verify).toContain("from public.jury_ballot_submissions submission");
    expect(verify).toContain("from public.jury_ballot_statuses status_row");
    expect(verify).toContain("'jury_voter_count_mismatch'");
    expect(verify).toContain("'jury_vote_row_count_mismatch'");
    expect(verify).toContain("'jury_dnv_count_mismatch'");
    expect(verify).toContain("'jury_pending_review_count_mismatch'");
    expect(verify).toContain("'jury_invalidated_count_mismatch'");
    expect(verify).toContain("'jury_readiness_mismatch'");
    expect(verify).toContain("jsonb_array_length(v_issues) = 0");
  });

  it("keeps both recovery boundaries read-only and service-role-only", () => {
    for (const name of [
      "studio2_rebuild_jury_operational_projection",
      "studio2_verify_jury_operational_projection",
    ]) {
      const body = functionBody(name);
      expect(body).toContain("stable");
      expect(body).not.toMatch(/\binsert\s+into\b/i);
      expect(body).not.toMatch(/\bupdate\s+[a-z0-9_."]+\s+set\b/i);
      expect(body).not.toMatch(/\bdelete\s+from\b/i);
    }

    expect(migration).toContain(
      "revoke all on function public.studio2_rebuild_jury_operational_projection(uuid, integer, integer)",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_verify_jury_operational_projection(uuid, integer, integer)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain("to service_role;");
  });

  it("does not cross the Jury/Results authority boundary", () => {
    const verify = functionBody("studio2_verify_jury_operational_projection");
    expect(verify).not.toContain("sync_show_results_from_votes");
    expect(verify).not.toContain("materialize_show_results_if_missing");
    expect(migration).not.toMatch(/\b(update|insert into|delete from)\s+public\.results\b/i);
  });

  it("ships local-only executable evidence for ACL, recomputation, verification and bounds", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("set role service_role");
    expect(rehearsal).toContain("authenticated rebuild");
    expect(rehearsal).toContain("authenticated verifier");
    expect(rehearsal).toContain("'state'] == 'recomputed'");
    expect(rehearsal).toContain("'state'] == 'consistent'");
    expect(rehearsal).toContain("'reason'] == 'voter_bound_exceeded'");
    expect(rehearsal).toContain("'reason'] == 'verification_voter_bound_exceeded'");
  });
});
