import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function repoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("SSC4 historical import", () => {
  it("uses the real Tal Di Fjeme country identity and imports the complete line-up", () => {
    const sql = repoFile("scripts/import-ssc4-two-round-televote-results.sql");

    expect(sql).toContain("('Tal Di Fjeme',      6");
    expect(sql).toContain("insert into public.participants");
    expect(sql).toContain("insert into public.televote_votes");
    expect(sql).toContain("insert into public.results");
    expect(sql).toContain("participant-count verification");
    expect(sql).toContain("aggregate-televote-count verification");
    expect(sql).toContain("Tal Di Fjeme replacement verification");
    expect(sql).not.toContain("('Geming',");
  });

  it("keeps the two public-vote rounds and their exact historical totals", () => {
    const sql = repoFile("scripts/import-ssc4-two-round-televote-results.sql");

    expect(sql).toContain("'Web voting', 'weight', 65");
    expect(sql).toContain("'Instagram voting', 'weight', 35");
    expect(sql).toContain("<> 1856");
    expect(sql).toContain("<> 1206");
    expect(sql).toContain("<> 650");
  });

  it("preserves known historical ranks when every configured tie-break is still tied", () => {
    const migration = repoFile("supabase/migrations/20260823104500_preserve_existing_rank_for_full_ties.sql");

    expect(migration).toContain("r.final_rank as old_rank");
    expect(migration).toContain("k.old_rank nulls last");
  });
});
