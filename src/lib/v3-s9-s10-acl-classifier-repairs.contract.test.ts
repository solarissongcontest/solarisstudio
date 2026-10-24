import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024185000_v3_s9_s10_acl_classifier_repairs.sql",
  ),
  "utf8",
);

describe("S9/S10 ACL and workflow-classifier review repairs", () => {
  it("registers as a forward-only S13 repair", () => {
    expect(migration).toContain("'v3.s9-s10.acl-classifier-repairs'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,\n  null,");
  });

  it("closes direct service-role execution of the renamed Jury internals", () => {
    expect(migration).toContain(
      "revoke all on function public.v3_submit_jury_ballot_legacy_impl(uuid, jsonb, uuid, uuid, text)",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_reconcile_jury_submission_legacy_impl(uuid)",
    );
    expect(migration.match(/from public, anon, authenticated, service_role;/g)?.length).toBe(2);
    expect(migration).not.toContain(
      "grant execute on function public.v3_submit_jury_ballot_legacy_impl",
    );
  });

  it("classifies every supported Televote deadline mutation as a voting transition", () => {
    for (const command of [
      "televote.deadline.change",
      "televote.deadline.set",
      "televote.extend",
    ]) {
      expect(migration).toContain(`'${command}'`);
    }
    expect(migration).toContain("then 'voting_round_transition'");
  });

  it("preserves participant submission classes and fixed low-cardinality behavior", () => {
    expect(migration).toContain("p_command = 'jury.submit'");
    expect(migration).toContain("then 'jury_submission'");
    expect(migration).toContain("p_command = 'televote.submit'");
    expect(migration).toContain("then 'televote_submission'");
    expect(migration).toContain("language sql\nimmutable");
    expect(migration).toContain("set search_path = pg_catalog");
  });
});
