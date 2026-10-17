import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const publication = readFileSync("src/lib/show-publication-lifecycle.ts", "utf8");

describe("V3 Organizer Publication trust boundary", () => {
  it("rejects snapshot rows outside the requested edition", () => {
    expect(publication).toContain(
      "controls.some((control) => control.editionId !== editionId)",
    );
    expect(publication).toContain(
      "publication controls outside the requested edition scope",
    );
  });

  it("binds a preview to the requested show and target state", () => {
    expect(publication).toContain(
      "preview.showId !== input.showId || preview.targetState !== input.targetState",
    );
    expect(publication).toContain(
      "publication preview for a different requested operation",
    );
  });

  it("does not accept an apply receipt that contradicts the commanded state", () => {
    expect(publication).toContain("receipt.state !== input.preview.targetState");
    expect(publication).toContain(
      "publication receipt for a different target state",
    );
  });
});
