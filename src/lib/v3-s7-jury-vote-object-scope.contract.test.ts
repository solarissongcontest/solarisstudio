import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016062000_v3_s7_jury_vote_object_scope.sql"),
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

describe("System V3 S7 jury vote object scope", () => {
  it("guards every edition-bearing jury vote object at the database boundary", () => {
    expect(migration).toContain("private.v3_assert_jury_vote_object_scope");
    expect(migration).toContain("Jury vote show belongs to another edition");
    expect(migration).toContain("Jury voter belongs to another edition");
    expect(migration).toContain("Jury voter entity belongs to another edition");
    expect(migration).toContain("Jury recipient entity belongs to another edition");
    expect(migration).toContain("Jury recipient country does not belong to this edition");
    expect(migration).toContain("Jury ballot submission belongs to another edition or show");
    expect(migration).toContain("before insert or update of edition_id, show_id, voter_id, voter_country_id, voter_entity_id");
  });

  it("makes legacy assign and clear RPCs resolve object scope before capability evaluation", () => {
    for (const name of ["assign_jury_vote", "clear_jury_point"]) {
      const fn = publicFunctionBlock(name);
      const guard = fn.indexOf("private.v3_assert_jury_vote_object_scope");
      const auth = fn.indexOf("studio2_access_allowed('jury.ballots.manage'");
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(auth).toBeGreaterThan(guard);
    }
  });

  it("keeps the shared scope guard private from browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_assert_jury_vote_object_scope(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated;");
  });

  it("uses hostile local-only clean replay and current-main upgrade tests", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Edition-A authorization with Edition-B show");
    expect(rehearsal).toContain("Edition-A authorization with Edition-B voter");
    expect(rehearsal).toContain("Edition-A authorization with Edition-B recipient entity");
    expect(rehearsal).toContain("direct cross-edition show insert");
    expect(rehearsal).toContain("same-edition jury vote assignment");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toMatch(/supabase\.co/i);
  });
});
