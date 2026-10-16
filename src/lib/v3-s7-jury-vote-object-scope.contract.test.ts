import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016071000_v3_s7_jury_vote_object_scope_v2.sql"),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s7-jury-vote-object-scope-rehearsal.sh"),
  "utf8",
);
const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s7-jury-vote-object-scope-rehearsal.yml"),
  "utf8",
);

function publicFunctionBlock(name: string) {
  const marker = `create or replace function public.${name}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S7 jury vote object scope v2", () => {
  it("guards every edition-bearing vote object and exact voter identity", () => {
    expect(migration).toContain("private.v3_assert_jury_vote_object_scope");
    expect(migration).toContain("Jury vote show belongs to another edition");
    expect(migration).toContain("Jury voter belongs to another edition");
    expect(migration).toContain(
      "v_object_show_id is not null and v_object_show_id is distinct from p_show_id",
    );
    expect(migration).toContain("Jury voter entity does not match the voter identity");
    expect(migration).toContain("Jury voter entity belongs to another edition");
    expect(migration).toContain("Jury recipient entity belongs to another edition");
    expect(migration).toContain("Jury recipient country does not belong to this edition");
    expect(migration).toContain("Jury ballot submission belongs to another edition or show");
  });

  it("does not let country-less custom entities borrow arbitrary country identity", () => {
    expect(migration).toContain(
      "p_voter_country_id is not null and v_object_country_id is distinct from p_voter_country_id",
    );
    expect(migration).toContain(
      "p_receiving_country_id is not null and v_object_country_id is distinct from p_receiving_country_id",
    );
    expect(rehearsal).toContain("custom voter entity paired with arbitrary country");
    expect(rehearsal).toContain("custom recipient entity paired with arbitrary country");
  });

  it("audits existing rows transactionally before enforcement completes", () => {
    expect(migration).toContain("do $audit$");
    expect(migration).toContain("for vote_row in select * from public.jury_votes loop");
    expect(migration).toContain("vote_row.ballot_submission_id");
    expect(migration.trimEnd()).toMatch(/commit;$/);
  });

  it("protects valid votes from reverse drift in referenced parent rows", () => {
    for (const fn of [
      "private.v3_guard_jury_show_reference_scope",
      "private.v3_guard_jury_voter_reference_scope",
      "private.v3_guard_jury_entity_reference_scope",
      "private.v3_guard_jury_ballot_reference_scope",
    ]) {
      expect(migration).toContain(fn);
    }
    expect(migration).toContain("before update of edition_id on public.shows");
    expect(migration).toContain(
      "before update of edition_id, show_id, country_id, contest_entity_id on public.voters",
    );
    expect(migration).toContain(
      "before update of edition_id, country_id on public.contest_entities",
    );
    expect(migration).toContain(
      "before update of edition_id, show_id on public.jury_ballot_submissions",
    );
    expect(rehearsal).toContain("referenced show edition drift");
    expect(rehearsal).toContain("referenced voter show drift");
    expect(rehearsal).toContain("referenced voter entity edition drift");
    expect(rehearsal).toContain("referenced recipient entity edition drift");
  });

  it("keeps legacy canonical-null voter identity compatible", () => {
    expect(migration).toContain(
      "p_voter_entity_id is not null and v_voter_entity_id is not null",
    );
    expect(rehearsal).toContain("legacy canonical-null voter remains valid");
    expect(rehearsal).toContain("legacy compatible assignment persisted");
  });

  it("resolves object scope before capability evaluation in legacy RPCs", () => {
    for (const name of ["assign_jury_vote", "clear_jury_point"]) {
      const fn = publicFunctionBlock(name);
      const guard = fn.indexOf("private.v3_assert_jury_vote_object_scope");
      const auth = fn.indexOf("studio2_access_allowed('jury.ballots.manage'");
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(auth).toBeGreaterThan(guard);
    }
  });

  it("keeps all scope helpers private from browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_assert_jury_vote_object_scope(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
    expect(migration).toContain(
      "revoke all on function private.v3_guard_jury_voter_reference_scope() from public, anon, authenticated;",
    );
  });

  it("uses hostile local-only clean replay and current-main upgrade tests", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Edition-A authorization with Edition-B show");
    expect(rehearsal).toContain("show-scoped voter with null vote show");
    expect(rehearsal).toContain("canonical voter/entity mismatch");
    expect(rehearsal).toContain("same-edition jury vote assignment");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toMatch(/supabase\.co/i);
  });
});
