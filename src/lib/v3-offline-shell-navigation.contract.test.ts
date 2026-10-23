import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const offlineShell = () => readFileSync("public/offline.html", "utf8");
const webManifest = () =>
  JSON.parse(readFileSync("public/site.webmanifest", "utf8")) as {
    shortcuts?: Array<{ name?: string; short_name?: string; url?: string }>;
  };

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

  it("keeps the installed-app Me shortcut on the canonical V3 entry route", () => {
    const shortcuts = webManifest().shortcuts ?? [];
    const meShortcut = shortcuts.find((shortcut) => shortcut.short_name === "Me");

    expect(meShortcut).toEqual(
      expect.objectContaining({
        name: "Me",
        short_name: "Me",
        url: "/me",
      }),
    );
    expect(shortcuts.some((shortcut) => shortcut.url === "/my-solaris")).toBe(false);
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