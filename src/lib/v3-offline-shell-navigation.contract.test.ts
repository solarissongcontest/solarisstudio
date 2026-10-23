import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const offlineShell = () => readFileSync("public/offline.html", "utf8");

describe("V3 offline shell navigation contract", () => {
  it("keeps the canonical Public destinations and Me route", () => {
    const source = offlineShell();

    expect(source).toContain('href="/" data-tab="home"');
    expect(source).toContain('href="/explore" data-tab="explore"');
    expect(source).toContain('href="/participate" data-tab="participate"');
    expect(source).toContain('href="/results" data-tab="results"');
    expect(source).toContain('href="/me" data-tab="me"');
    expect(source).not.toContain('href="/my-solaris" data-tab="me"');
  });

  it("uses navigation-current semantics instead of tab-selection semantics", () => {
    const source = offlineShell();

    expect(source).toContain('node.setAttribute("aria-current", "page")');
    expect(source).toContain('node.removeAttribute("aria-current")');
    expect(source).toContain('.tab[aria-current="page"]');
    expect(source).not.toContain("aria-selected");
    expect(source).toContain('aria-label="Solaris Studio primary navigation"');
  });

  it("keeps the degraded shell perceivable when visual effects are reduced", () => {
    const source = offlineShell();

    expect(source).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(source).toContain("backdrop-filter: none");
    expect(source).toContain("-webkit-backdrop-filter: none");
    expect(source).toContain(".tab:focus-visible");
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
