import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261104121500_v3_tg2_office_term_effective_authority.sql"), "utf8");
const rehearsal = readFileSync(resolve(process.cwd(),
  ".github/scripts/v3-tg2-office-term-effective-rehearsal.sql"), "utf8");
const runner = readFileSync(resolve(process.cwd(),
  ".github/scripts/v3-tg2-identity-linkage-privacy-rehearsal.sh"), "utf8");

describe("TG2 effective office authority and public office-holder display", () => {
  it("requires the canonical start instant in both authority and projection", () => {
    expect((migration.match(/term_row\.started_at <= now\(\)/g) ?? []).length).toBe(2);
    expect(migration).toContain("and term_row.actual_end_at is null");
    expect(migration).toContain("office_row.organ_id is null");
    expect(migration).toContain("visible_organ.visibility = 'public'");
    expect(migration).not.toContain("scheduled_end_at <= now()");
  });
  it("rehearses future, current and ended authority under a real authenticated role", () => {
    for(const code of [
      "set local role authenticated",
      "TG2_OFFICE_EFFECTIVE_FUTURE_CAPABILITY_LEAK",
      "TG2_OFFICE_EFFECTIVE_FUTURE_PUBLICATION_LEAK",
      "TG2_OFFICE_EFFECTIVE_CURRENT_CAPABILITY_MISSING",
      "TG2_OFFICE_EFFECTIVE_CURRENT_PUBLICATION_MISSING",
      "TG2_OFFICE_EFFECTIVE_ENDED_CAPABILITY_LEAK",
      "rollback;",
    ]) expect(rehearsal).toContain(code);
    expect(runner).toContain("v3-tg2-office-term-effective-rehearsal.sql");
    expect(runner).toContain("Refusing hosted Supabase rehearsal");
    expect(runner).toContain("Refusing non-local database rehearsal");
  });
});
