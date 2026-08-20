import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./admin-desktop.css", import.meta.url), "utf8");

describe("desktop jury workspace layout", () => {
  it("keeps FastJuryEntry as the only two-column jury layout owner", () => {
    expect(css).toContain(".admin-jury-entry {\n  display: block;");
    expect(css).not.toContain(".admin-jury-entry {\n    display: grid;");
    expect(css).not.toContain("grid-template-columns: minmax(14rem, .72fr) minmax(0, 2.28fr)");
  });

  it("does not turn the voter selector into a second sticky desktop column", () => {
    expect(css).toContain(".admin-jury-voters {\n    position: static;");
    expect(css).not.toContain(".admin-jury-voters {\n    position: sticky;");
  });
});
