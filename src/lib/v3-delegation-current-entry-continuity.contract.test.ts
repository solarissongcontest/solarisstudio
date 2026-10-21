import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("V3 Delegation current-state continuity", () => {
  it("does not promote completed or archived participation into current entry state", () => {
    const implementation = source("src/integrations/v3/delegation-source.server.ts");

    expect(implementation).toContain("resolveV3DelegationCurrentParticipationEdition");
    expect(implementation).toContain("resolveCurrentPublicEdition");
    expect(implementation).toContain("normalizeLegacyEditionStatus");
    expect(implementation).toContain('lifecycle === "post_edition"');
    expect(implementation).toContain('lifecycle === "archived"');
    expect(implementation).toContain(
      "currentParticipationEdition?.id ?? null",
    );
  });

  it("matches current entry by active edition identity instead of archive order", () => {
    const implementation = source("src/integrations/v3/delegation-source.server.ts");

    expect(implementation).toContain(
      "entries.find((entry) => entry.editionId === currentEditionId) ?? null",
    );
    expect(implementation).not.toContain("currentEntry: entries[0]");
    expect(implementation).toContain("history: entries");
  });

  it("keeps completed results current until the edition is archived", () => {
    const implementation = source("src/integrations/v3/delegation-source.server.ts");

    expect(implementation).toContain("resolveV3DelegationCurrentResultEdition");
    expect(implementation).toContain(
      'normalizeLegacyEditionStatus(current.status) === "archived"',
    );
    expect(implementation).toContain("currentEdition: currentResultEdition");
    expect(implementation).toContain(
      'resultsBundle.input.editionId !== input.currentEdition.id',
    );
  });

  it("keeps the edition lookup publication-bounded and narrow", () => {
    const implementation = source("src/integrations/v3/delegation-source.server.ts");

    expect(implementation).toContain(
      'const EDITION_COLUMNS = "id,edition_number,slug,status,published";',
    );
    expect(implementation).toContain('.from("editions")');
    expect(implementation).toContain('.eq("published", true)');
    expect(implementation).not.toContain("host_country_id");
    expect(implementation).not.toContain("host_city");
    expect(implementation).not.toContain("theme_id");
  });

  it("explains that historical entries remain history when no current entry is public", () => {
    const screen = source("src/components/v3/V3DelegationScreen.tsx");

    expect(screen).toContain("No current public entry");
    expect(screen).toContain("Historical participation stays in Participation history");
    expect(screen).not.toContain("No public entry yet");
  });

  it("keeps current-state authority off the browser clock and storage", () => {
    const implementation = source("src/integrations/v3/delegation-source.server.ts");

    expect(implementation).not.toContain("localStorage");
    expect(implementation).not.toContain("sessionStorage");
    expect(implementation).not.toContain("Date.now(");
  });
});
