import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const offlineHtml = () => readFileSync("public/offline.html", "utf8");

function resolveOfflineExperience({
  displayModeStandalone = false,
  iosStandalone = false,
}: {
  displayModeStandalone?: boolean;
  iosStandalone?: boolean;
}) {
  const html = offlineHtml();
  const match = html.match(/<script data-solaris-experience>([\s\S]*?)<\/script>/);
  expect(match?.[1]).toBeTruthy();

  const dataset: Record<string, string> = {};
  const matchMedia = vi.fn((query: string) => ({
    matches: query === "(display-mode: standalone)" && displayModeStandalone,
  }));

  // Execute the actual inline bootstrap, without loading the rest of the page
  // or making a network request. Browser identity is runtime, not viewport.
  runInNewContext(match![1], {
    window: {
      navigator: { standalone: iosStandalone },
      matchMedia,
    },
    document: { documentElement: { dataset } },
  });

  return { installed: dataset.solarisInstalled, matchMedia };
}

describe("V3 offline three-experience navigation boundary", () => {
  it("keeps ordinary mobile and desktop browsers in the web family", () => {
    const mobile = resolveOfflineExperience({});
    const desktop = resolveOfflineExperience({});
    expect(mobile.installed).toBe("false");
    expect(desktop.installed).toBe("false");
    expect(mobile.matchMedia).toHaveBeenCalledWith("(display-mode: standalone)");
  });

  it("uses the app dock only for installed display-mode or iOS standalone", () => {
    expect(resolveOfflineExperience({ displayModeStandalone: true }).installed).toBe("true");
    expect(resolveOfflineExperience({ iosStandalone: true }).installed).toBe("true");
  });

  it("resolves presentation before the stylesheet and hides the fixed dock by default", () => {
    const html = offlineHtml();
    expect(html.indexOf("<script data-solaris-experience>")).toBeGreaterThan(0);
    expect(html.indexOf("<script data-solaris-experience>")).toBeLessThan(html.indexOf("<style>"));
    expect(html).toMatch(/\.tabbar\s*\{[\s\S]*?display: none;/);
    expect(html).toContain('html[data-solaris-installed="true"] .tabbar { display: grid; }');
    expect(html).toContain('html[data-solaris-installed="true"] .web-nav { display: none; }');
    expect(html).toContain('html[data-solaris-installed="true"] main {');
    expect(html).not.toContain('window.innerWidth');
  });

  it("provides accessible browser-native section links without duplicating installed navigation", () => {
    const html = offlineHtml();
    const web = html.match(/<nav class="web-nav" aria-label="Offline website navigation">([\s\S]*?)<\/nav>/)?.[1];
    const app = html.match(/<nav class="tabbar" aria-label="Offline Solaris Studio">([\s\S]*?)<\/nav>/)?.[1];
    expect(web).toBeTruthy();
    expect(app).toBeTruthy();
    for (const [tab, destination] of [
      ["home", "/"],
      ["explore", "/explore"],
      ["participate", "/participate"],
      ["results", "/results"],
      ["me", "/me"],
    ]) {
      const link = `href="${destination}" data-tab="${tab}"`;
      expect(web).toContain(link);
      expect(app).toContain(link);
    }
    expect(html).toContain('document.querySelectorAll("[data-tab]")');
    expect(html).toContain('node.setAttribute("aria-current", "page")');
    expect(html).toContain(".web-nav a:focus-visible");
    expect(html).toContain("min-height: 44px;");
  });

  it("preserves offline privacy and no-submission guarantees", () => {
    const html = offlineHtml();
    expect(html).toContain("isSafeOfflinePublicPath(item.path)");
    expect(html).toContain("label.textContent = item.label");
    expect(html).toContain("official confirmations, jury ballots and televotes require a live server acknowledgement");
    expect(html).toContain("never queued without a live server acknowledgement");
    expect(html).not.toContain("createClient(");
  });
});
