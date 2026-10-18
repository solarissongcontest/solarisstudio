import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Delegation history and entity graph", () => {
  it("renders the complete publication-safe participation history", () => {
    const screen = read("src/components/v3/V3DelegationScreen.tsx");

    expect(screen).toContain("projection.participationHistory.map");
    expect(screen).not.toContain("participationHistory.slice(0, 10)");
    expect(screen).toContain("projection.participationHistory.length");
  });

  it("connects Delegation detail to the canonical discovery and analysis surfaces", () => {
    const screen = read("src/components/v3/V3DelegationScreen.tsx");

    expect(screen).toContain('title="Results"');
    expect(screen).toContain("to={projection.resultsDestination}");
    expect(screen).toContain('title="Voting relationships"');
    expect(screen).toContain('to="/relationships"');
    expect(screen).toContain('title="Stories"');
    expect(screen).toContain('to="/stories"');
    expect(screen).toContain("to={wiki.href}");
    expect(screen).toContain("to={compare.href}");
    expect(screen).toContain('to="/countries"');
  });

  it("does not manufacture edition URLs from mutable labels", () => {
    const screen = read("src/components/v3/V3DelegationScreen.tsx");
    const projection = read("src/lib/v3-explore-entities.ts");
    const source = read("src/integrations/v3/delegation-source.server.ts");

    expect(projection).not.toContain("slugify(");
    expect(source).not.toContain("slugify(");
    expect(screen).not.toContain("entry.editionLabel.toLowerCase");
    expect(screen).not.toContain("replaceAll(\" \", \"-\")");
  });

  it("keeps personal following mutations outside this public presentation slice", () => {
    const screen = read("src/components/v3/V3DelegationScreen.tsx");

    expect(screen).toContain("following mutations remain owned by");
    expect(screen).not.toContain("useMutation");
    expect(screen).not.toContain(".insert(");
    expect(screen).not.toContain(".update(");
  });
});
