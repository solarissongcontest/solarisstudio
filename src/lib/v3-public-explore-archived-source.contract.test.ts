import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/integrations/v3/explore-source.server.ts"),
    "utf8",
  );

describe("V3 Explore archived-source boundary", () => {
  it("does not promote the resolver's archived fallback to current Explore context", () => {
    const implementation = source();

    expect(implementation).toContain("const resolvedCurrentEdition = resolveCurrentPublicEdition(editions)");
    expect(implementation).toContain(
      'normalizeLegacyEditionStatus(resolvedCurrentEdition.status) !== "archived"',
    );
    expect(implementation).toContain("? resolvedCurrentEdition");
    expect(implementation).toContain(": null;");
  });

  it("uses the filtered current edition for current-only show/result reads", () => {
    const implementation = source();

    expect(implementation).toContain("if (currentEdition) {");
    expect(implementation).toContain('.eq("edition_id", currentEdition.id)');
    expect(implementation).toContain("edition: currentEdition");
  });

  it("falls discovery back to the edition archive when no non-archived current edition exists", () => {
    const implementation = source();

    expect(implementation).toContain(
      'songsAndArtists: currentEdition ? `/editions/${currentEdition.slug}` : "/editions"',
    );
    expect(implementation).toContain("currentEditionId: currentEdition?.id ?? null");
    expect(implementation).toContain("editionLabel: editionLabel(currentEdition)");
  });
});
