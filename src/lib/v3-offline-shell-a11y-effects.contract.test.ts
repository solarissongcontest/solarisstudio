import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const offlineShell = () => readFileSync("public/offline.html", "utf8");

describe("V3 offline shell accessibility and effect fallbacks", () => {
  it("keeps keyboard focus visible across the degraded shell", () => {
    const source = offlineShell();

    expect(source).toContain(".primary:focus-visible");
    expect(source).toContain(".row:focus-visible");
    expect(source).toContain(".tab:focus-visible");
    expect(source).toContain("outline: 2px solid #dff7ff");
    expect(source).toContain("outline-offset: 2px");
  });

  it("preserves shell geometry while reducing transparency effects", () => {
    const source = offlineShell();

    expect(source).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(source).toContain("backdrop-filter: none");
    expect(source).toContain("-webkit-backdrop-filter: none");
    expect(source).toContain(".toolbar,");
    expect(source).toContain(".tabbar {");
    expect(source).toContain("background: #071426");
  });

  it("announces connectivity without reading decorative navigation glyphs", () => {
    const source = offlineShell();

    expect(source).toContain('id="connection-status" role="status" aria-live="polite"');
    expect(source.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(source).toContain('chevron.setAttribute("aria-hidden", "true")');
  });
});
