import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public scorechart entry focus", () => {
  it("keeps receiving-entry focus shareable and presentation-only", () => {
    const matrix = read("src/components/VotingMatrix.tsx");

    expect(matrix).toContain("useRouterState");
    expect(matrix).toContain("nominatedReceivingEntry(search)");
    expect(matrix).toContain("raw.trim().slice(0, 128)");
    expect(matrix).toContain("rows.includes(nominatedEntry)");
    expect(matrix).toContain("visibleRows = focusedEntry ? rows.filter");
    expect(matrix).toContain("entry: entryId || undefined");
    expect(matrix).toContain("entry: undefined");
    expect(matrix).toContain("replace: true");
    expect(matrix).toContain('data-public-scorechart-entry-focus={focusedEntry ?? "all"}');
    expect(matrix).toContain("Focus receiving entry");
  });

  it("cannot use an arbitrary query value to load or reveal voting data", () => {
    const matrix = read("src/components/VotingMatrix.tsx");

    expect(matrix).toContain("already-public receiving rows");
    expect(matrix).toContain("if (!invalidEntryNomination) return;");
    expect(matrix).not.toContain("useJuryVotes(");
    expect(matrix).not.toContain("useResults(");
    expect(matrix).not.toContain("supabase");
    expect(matrix).not.toContain("localStorage");
    expect(matrix).not.toContain("sessionStorage");
  });

  it("applies the same focused row set to mobile and desktop matrices", () => {
    const matrix = read("src/components/VotingMatrix.tsx");
    const occurrences = matrix.match(/visibleRows\.map/g) ?? [];

    expect(occurrences.length).toBe(3);
    expect(matrix).toContain("All receiving entries");
    expect(matrix).toContain("Open full voting matrix");
    expect(matrix).toContain('className="scroll-slim hidden overflow-auto sm:block"');
  });
});
