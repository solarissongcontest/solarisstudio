import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 Broadcast edition isolation", () => {
  it("validates production commands against the selected show's canonical edition", () => {
    const route = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(route).toContain("validateEditionCommandScope");
    expect(route).toContain("routeEditionId: editionId ?? null");
    expect(route).toContain("commandEditionId: editionId ?? null");
    expect(route).toContain("entityEditionId: show?.edition_id ?? null");
    expect(route).toContain("{ status: 409 }");
  });

  it("guards save lock and segment transition before their production writes", () => {
    const route = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(route).toContain(
      "assertProductionEditionScope();\n      return saveStudio2BroadcastRundown",
    );
    expect(route).toContain(
      "assertProductionEditionScope();\n      return setStudio2BroadcastRundownLock",
    );
    expect(route).toContain(
      "assertProductionEditionScope();\n      return transitionStudio2BroadcastSegment",
    );
  });

  it("keeps rehearsal mode local and outside production authority checks", () => {
    const route = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(route).toContain("if (mode === 'rehearsal') return;");
    expect(route).toContain(
      "if (mode === 'rehearsal') return Promise.resolve(draft);",
    );
    expect(route).toContain(
      "Rehearsal mode never calls a production mutation",
    );
  });
});
