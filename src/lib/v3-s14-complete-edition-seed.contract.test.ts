import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stage1 = readFileSync(".github/scripts/v3-s14-stage-1-setup.sh", "utf8");
const qualification = readFileSync(
  "supabase/migrations/20260822212800_result_rank_is_qualification_source.sql",
  "utf8",
);
const publication = readFileSync("src/lib/publication.ts", "utf8");

describe("S14 complete-edition seed", () => {
  it("gives both semi-finals a deterministic top-10 qualification contract", () => {
    expect(stage1.match(/\\"qualifiers\\":10/g)?.length).toBe(2);
    expect(stage1).toContain("deterministic top-10 qualifier cutoff needed for a complete edition");
    expect(qualification).toContain("final_rank between 1 and cutoff");
    expect(qualification).toContain("set qualified = o.qualified");
  });

  it("does not pre-seed finalists before semi-final result truth exists", () => {
    expect(stage1).not.toMatch(/show_id[^\n]*\$FINAL_ID[\s\S]{0,300}from generate_series\(1, 66\)/i);
    expect(stage1).toContain("'$FINAL_ID', '$EDITION_ID', 'S14 Grand Final'");
  });

  it("anchors complete-edition evidence to public grand-final results", () => {
    expect(publication).toContain("resolveAutomaticEditionStatus");
    expect(publication).toContain("isGrandFinalKind");
    expect(publication).toContain(".results");
    expect(publication).toContain('return finalWithResults');
    expect(publication).toContain('? "completed"');
  });
});
