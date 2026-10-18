import { describe, expect, it } from "vitest";

import { renderMaintenancePage } from "./maintenance-page";

describe("TerraOS 3 first-paint reveal isolation", () => {
  it("hides server-rendered future reveals from the inert attribute before JavaScript runs", () => {
    const teaser = renderMaintenancePage();

    expect(teaser).toContain(".gate[inert] .reveal");
    expect(teaser).toContain(".gate[inert]::after");
    expect(teaser).not.toContain('.gate[data-revealed="false"] .reveal');
    expect(teaser).not.toContain('.gate[data-revealed="false"]::after');

    expect(teaser).toContain('inert data-reveal-at="2026-10-19T00:00:00+03:00"');
    expect(teaser).toContain('inert data-reveal-at="2026-10-20T00:00:00+03:00"');
    expect(teaser).toContain('inert data-reveal-at="2026-10-21T00:00:00+03:00"');

    expect(teaser).toMatch(/toggleAttribute\(['"]inert['"],\s*!open\)/);
    expect(teaser).toMatch(/removeAttribute\(['"]inert['"]\)/);
  });
});
