import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 country current-entry semantics", () => {
  it("resolves the canonical current public edition instead of treating newest history as current", () => {
    const source = read("src/integrations/v3/delegation-source.server.ts");

    expect(source).toContain("resolveCurrentPublicEdition");
    expect(source).toContain('.from("editions")');
    expect(source).toContain('.eq("published", true)');
    expect(source).toContain("currentEdition?.id ?? null");
    expect(source).not.toContain("currentEntry: entries[0]");
  });

  it("promotes a safe history row only when its stable edition id matches the current edition", () => {
    const source = read("src/integrations/v3/delegation-source.server.ts");

    expect(source).toContain("entries.find((entry) => entry.editionId === currentEditionId)");
    expect(source).toContain("?? null");
    expect(source).toContain("history: entries");
  });

  it("fails closed when current-edition resolution fails rather than relabeling archive history", () => {
    const source = read("src/integrations/v3/delegation-source.server.ts");

    expect(source).toContain('throwIfError(editionsResult.error, "Could not resolve the current public Solaris edition")');
    expect(source).toContain("currentEntry: currentEditionId");
    expect(source).toContain("entries.find((entry) => entry.editionId === currentEditionId)");
    expect(source).toMatch(/currentEntry:\s*currentEditionId[\s\S]*?: null,/);
    expect(source).not.toContain("currentEntry: entries[0]");
  });

  it("keeps raw result and voting authority out of the delegation source", () => {
    const source = read("src/integrations/v3/delegation-source.server.ts");

    expect(source).toContain("loadV3ResultsBundle()");
    expect(source).not.toContain('.from("results")');
    expect(source).not.toContain('.from("jury_votes")');
    expect(source).not.toContain('.from("televotes")');
    expect(source).not.toContain('.from("televote_votes")');
    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
  });
});
