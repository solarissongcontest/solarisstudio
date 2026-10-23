import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/taste-dna/index.tsx"),
  "utf8",
);
const controller = readFileSync(
  resolve(process.cwd(), "src/lib/v3-taste-dna.ts"),
  "utf8",
);

describe("Public V3 P21 Taste DNA retained-route integration", () => {
  it("reuses the extracted V3 reconciliation and analysis controller", () => {
    expect(route).toContain("buildV3TasteDnaAnalysis");
    expect(route).toContain("reconcileTasteRanking");
    expect(route).toContain('from "@/lib/v3-taste-dna"');
    expect(route).not.toContain("buildTasteDna({");
  });

  it("does not keep a second route-local saved-ranking reconciliation algorithm", () => {
    expect(route).not.toContain("const allowed = new Set(officialRanking)");
    expect(route).not.toContain("const seen = new Set(saved)");
    expect(controller).toContain("Removed/unpublished IDs are discarded");
    expect(controller).toContain("duplicates are");
  });

  it("keeps current-show history exclusion inside the reusable controller", () => {
    expect(route).not.toContain(".filter((ballot) => ballot.show_id !== showId)");
    expect(controller).toContain("ballot.showId !== currentShowId");
  });

  it("preserves server-backed persistence instead of adding browser persistence", () => {
    expect(route).toContain("useTasteBallots");
    expect(route).toContain("useSaveTasteBallot");
    expect(route).toContain("useDeleteTasteBallot");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
  });
});
