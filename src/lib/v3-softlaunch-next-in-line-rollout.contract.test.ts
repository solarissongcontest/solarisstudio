import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const originalSource = readFileSync(
  "supabase/migrations/20261016150000_v3_s7_next_in_line_authorization.sql",
  "utf8",
);
const localCandidate = readFileSync(
  "docs/v3/recovery-candidates/next-in-line-softlaunch-rollout-local.sql",
  "utf8",
);
const declaration = "create or replace function public.v3_submit_next_in_line(";
const endDeclaration = "\n$submit$;";
const guardStart = "  -- V3_NEXT_IN_LINE_ROLLOUT_GUARD_BEGIN";
const guardEnd = "  -- V3_NEXT_IN_LINE_ROLLOUT_GUARD_END";

function effectiveWriter(sql: string): string {
  const start = sql.indexOf(declaration);
  const end = sql.indexOf(endDeclaration, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  expect(sql.indexOf(declaration, start + declaration.length)).toBe(-1);
  return sql.slice(start, end + endDeclaration.length);
}

describe("Next in Line deferred soft-launch candidate (source-only, not deployable)", () => {
  const source = effectiveWriter(originalSource);
  const candidate = effectiveWriter(localCandidate);

  it("preserves the canonical mutation writer byte for byte except one bounded rollout check", () => {
    const start = candidate.indexOf(guardStart);
    const end = candidate.indexOf(guardEnd, start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const after = candidate.indexOf("\n\n", end) + 2;
    expect(after).toBeGreaterThan(end);
    expect(candidate.slice(0, start) + candidate.slice(after)).toBe(source);
  });

  it("binds rollout to the authenticated actor and canonical persisted source edition", () => {
    const rollout = candidate.slice(candidate.indexOf(guardStart), candidate.indexOf(guardEnd));
    expect(rollout).toContain("private.studio2_feature_enabled_for(");
    expect(rollout).toContain("v_actor,");
    expect(rollout).toContain("'next_in_line',");
    expect(rollout).toContain("v_source.edition_id");
    expect(rollout).toContain("message = 'FEATURE_UNAVAILABLE'");
    expect(rollout).not.toContain("payload ->>");
    expect(candidate.indexOf(guardStart)).toBeGreaterThan(
      candidate.indexOf("private.v3_next_in_line_actor_controls_country("),
    );
    expect(candidate.indexOf(guardStart)).toBeLessThan(
      candidate.indexOf("private.studio2_claim_operation("),
    );
    expect(candidate.indexOf(guardStart)).toBeLessThan(
      candidate.indexOf("insert into public.next_in_line_submissions ("),
    );
    expect(candidate.indexOf(guardStart)).toBeLessThan(
      candidate.indexOf("update public.next_in_line_submissions"),
    );
  });

  it("requires existing permission/window/receipt machinery and preserves roles", () => {
    expect(localCandidate).toContain("if to_regprocedure('public.v3_submit_next_in_line(jsonb,uuid,text)') is null");
    expect(localCandidate).toContain("to_regprocedure('private.studio2_feature_enabled_for(uuid,text,uuid)')");
    expect(localCandidate).toContain("raise exception 'Unexpected canonical Next in Line source; review required'");
    expect(candidate).toContain("private.v3_next_in_line_actor_controls_country");
    expect(candidate).toContain("private.studio2_next_in_line_window_is_open");
    expect(candidate).toContain("private.studio2_claim_operation");
    expect(candidate).toContain("private.studio2_complete_operation");
    expect(localCandidate).toContain(
      "revoke all on function public.v3_submit_next_in_line(jsonb, uuid, text)\n  from public, anon;",
    );
    expect(localCandidate).toContain(
      "grant execute on function public.v3_submit_next_in_line(jsonb, uuid, text)\n  to authenticated;",
    );
    expect(localCandidate).not.toMatch(/grant execute on function public.v3_submit_next_in_line\([^)]*\)\s+to anon/);
    expect(localCandidate).not.toMatch(/(insert into|update) public.studio2_feature_flags/);
  });

  it("narrowly extends the existing feature key whitelist without enabling Next in Line", () => {
    expect(localCandidate).toContain("pg_get_constraintdef(c.oid)");
    expect(localCandidate).toContain("studio2_feature_flags_key_check");
    expect(localCandidate).toContain("v_expression := substring(v_definition from 8");
    expect(localCandidate).toContain("check ((%s) or key = %L)");
    expect(localCandidate).toContain("'next_in_line'");
    expect(localCandidate).toContain("raise exception 'Unexpected feature flag whitelist definition'");
    expect(localCandidate).not.toMatch(/insert into public.studio2_feature_flags/i);
    expect(localCandidate).not.toMatch(/update public.studio2_feature_flags/i);
  });

  it("cannot be mistaken for an adopted migration or runtime certification", () => {
    expect(localCandidate).toContain("LOCAL-ONLY REVIEW CANDIDATE");
    expect(localCandidate).toContain("NOT A TRACKED MIGRATION");
    expect(localCandidate).toContain("System owner must independently approve");
    expect(localCandidate).toContain("hosted-equivalent negative/positive cases");
  });
});
