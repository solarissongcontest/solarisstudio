import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read(
  "supabase/migrations/20261104165500_v3_tg8_exact_rational_legislative_tally.sql",
);
const rehearsal = read("scripts/rehearse-v3-world-exact-vote-math.sql");
const wrapper = read("scripts/rehearse-v3-world-exact-vote-math.sh");

describe("Terra Solaris TG8 exact-rational legislative voting primitive", () => {
  it("uses exact NUMERIC multiplication instead of rounding or overflowing bigint", () => {
    expect(migration).toContain("p_ayes::numeric + p_nays::numeric + p_abstentions::numeric");
    expect(migration).toContain("v_cast * p_quorum_denominator::numeric");
    expect(migration).toContain("p_ayes::numeric * p_threshold_denominator::numeric");
    expect(migration).toContain("p_ayes::numeric * 2 > v_denominator");
    expect(migration).not.toMatch(/double precision|real\b|::float/i);
  });

  it("rejects unknown rules, wrong denominators, negative votes, duplicates and null counts", () => {
    expect(migration).toContain("p_denominator_policy <> 'all_cast_including_abstentions'");
    expect(migration).toContain("p_threshold_kind not in ('simple_majority', 'fraction', 'unanimity')");
    expect(migration).toContain("p_ayes < 0 or p_nays < 0 or p_abstentions < 0");
    expect(migration).toContain("v_cast > p_eligible_electorate::numeric");
    expect(migration).toContain("if p_ayes is null or p_nays is null");
    expect(migration).toContain("when not v_quorum_met then 'no_quorum'");
  });

  it("remains private: it neither casts nor certifies, and never creates official result rows", () => {
    expect(migration).toContain("create or replace function private.world_legislative_tally_v1");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/create\s+table\s+(?:public|private)\.world_/i);
    expect(migration).not.toMatch(/insert into (?:public|private)\.world_(?:ballots|votes|results)/i);
    expect(migration).not.toMatch(/grant execute.+to authenticated/is);
  });

  it("commits executable boundary scenarios, including abstentions and hostile input", () => {
    for (const example of [
      "(8,2,5,20,1,2",
      "(7,3,5,20,1,2",
      "(10,0,5,15,1,2",
      "(9,0,6,15,1,2",
      "(3,0,1,4,1,2",
      "(0,0,0,0,1,2",
      "9223372036854775807",
      "insufficient_privilege",
      "rollback;",
    ]) {
      expect(rehearsal).toContain(example);
    }
  });

  it("uses a fail-closed local-only wrapper rather than production Supabase", () => {
    expect(wrapper).toContain("supabase status -o env");
    expect(wrapper).toContain("http://127.0.0.1:");
    expect(wrapper).toContain("postgres://postgres:postgres@127.0.0.1:");
    expect(wrapper).toContain('fail "Refusing hosted/non-loopback database"');
    expect(wrapper).toContain('psql "$DB_URL"');
    expect(wrapper).not.toContain("DATABASE_URL");
  });
});
