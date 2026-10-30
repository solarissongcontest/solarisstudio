import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261024223400_v3_result_countback_parity.sql"),
  "utf8",
);
const organizerComparator = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/voting-system/$slug.tsx"),
  "utf8",
);
const televoteSync = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/results-sync.server.ts"),
  "utf8",
);

describe("V3 canonical Results countback parity", () => {
  it("registers a forward-only repair without rewriting historical result rows", () => {
    expect(migration).toContain("'v3.results.countback-parity'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,\n  null,");
    expect(migration).not.toMatch(/update\s+public\.results[\s\S]*where\s+show_id\s+is\s+null/i);
  });

  it("builds a highest-score-first lexicographic Jury award-count vector", () => {
    expect(migration).toContain("v_countback_scale integer[]");
    expect(migration).toContain("array_agg(score order by score desc)");
    expect(migration).toContain("countback_counts");
    expect(migration).toContain("counted.points = score.value");
    expect(migration).toContain("then k.countback_counts else null::integer[] end desc nulls last");
    expect(migration).not.toContain("when 'countback' then k.top_scores");
  });

  it("preserves the same countback semantics already used by Organizer and Televote sync", () => {
    expect(organizerComparator).toContain(".sort((a, b) => b - a)");
    expect(organizerComparator).toContain('if (rule === "countback")');
    expect(organizerComparator).toContain("for (const score of juryScale)");
    expect(televoteSync).toContain('if (rule === "countback")');
    expect(televoteSync).toContain("for (const score of juryScale)");
  });
});
