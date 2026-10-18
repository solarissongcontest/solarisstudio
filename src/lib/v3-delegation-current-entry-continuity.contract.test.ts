import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = () =>
  readFileSync(resolve(root, "src/integrations/v3/delegation-source.server.ts"), "utf8");

describe("V3 Delegation current-entry continuity", () => {
  it("resolves current participation from canonical public edition lifecycle", () => {
    const implementation = source();

    expect(implementation).toContain("resolveCurrentPublicEdition");
    expect(implementation).toContain("normalizeLegacyEditionStatus");
    expect(implementation).toContain('lifecycle === "post_edition"');
    expect(implementation).toContain('lifecycle === "archived"');
    expect(implementation).toContain("return null;");
  });

  it("matches the entry to the resolved current edition instead of archive order", () => {
    const implementation = source();

    expect(implementation).toContain(
      "entries.find((entry) => entry.editionId === currentEditionId) ?? null",
    );
    expect(implementation).not.toContain("currentEntry: entries[0]");
  });

  it("keeps current-edition authority server-owned and publication-bounded", () => {
    const implementation = source();

    expect(implementation).toContain('.from("editions")');
    expect(implementation).toContain('.eq("published", true)');
    expect(implementation).toContain('client.rpc("v3_public_country_profile"');
    expect(implementation).toContain("Promise.all");
    expect(implementation).not.toContain("localStorage");
    expect(implementation).not.toContain("sessionStorage");
    expect(implementation).not.toContain("Date.now(");
  });

  it("preserves the complete published history independently from currentEntry", () => {
    const implementation = source();

    expect(implementation).toContain("history: entries");
    expect(implementation).toContain("currentEntry,");
  });
});
