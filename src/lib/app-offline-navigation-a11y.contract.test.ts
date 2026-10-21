import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("offline app navigation semantics", () => {
  it("keeps the fallback as semantic navigation links with one current page", () => {
    const offline = source("public/offline.html");

    expect(offline).toContain('<nav class="tabbar" aria-label="Offline Solaris Studio">');
    for (const [tab, href] of [
      ["home", "/"],
      ["explore", "/explore"],
      ["participate", "/participate"],
      ["results", "/results"],
      ["me", "/my-solaris"],
    ]) {
      expect(offline).toContain(`href="${href}" data-tab="${tab}"`);
    }

    expect(offline).toContain('.tab[aria-current="page"]');
    expect(offline).toContain('node.setAttribute("aria-current", "page")');
    expect(offline).toContain('node.removeAttribute("aria-current")');
    expect(offline).not.toContain("aria-selected");
    expect(offline).not.toContain('role="tab"');
  });

  it("preserves offline critical-workflow safety copy", () => {
    const offline = source("public/offline.html");

    expect(offline).toContain("Official submissions are never queued without a live server acknowledgement");
    expect(offline).toContain("Official actions are paused");
    expect(offline).toContain("solaris:offline-public-index:v1");
  });
});
