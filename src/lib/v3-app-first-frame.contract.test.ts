import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const root = source("src/routes/__root.tsx");
const shellCss = source("src/styles/app-shell.css");

describe("V3 installed-app first-frame handoff", () => {
  it("shows launch chrome only for a cold installed-app session", () => {
    expect(root).toContain('const bootSessionKey = "solaris.v3.boot.seen"');
    expect(root).toContain("sessionStorage.getItem(bootSessionKey)");
    expect(root).toContain("sessionStorage.setItem(bootSessionKey, \"1\")");
    expect(root).toContain("if (!shouldShowBootFrame) return");
    expect(root).toContain('root.setAttribute("data-solaris-app-boot", "")');
  });

  it("keeps the emergency splash guard bounded while normal hydration owns the handoff", () => {
    expect(root).toContain(
      'window.setTimeout(() => root.removeAttribute("data-solaris-app-boot"), 1800)',
    );
    expect(root).not.toContain(
      'window.setTimeout(() => root.removeAttribute("data-solaris-app-boot"), 4000)',
    );
  });

  it("uses Solaris Studio identity for the cold first frame rather than legacy TSBC launch branding", () => {
    const bootSection = shellCss.slice(
      shellCss.indexOf("/* Installed-app first-paint guard"),
      shellCss.indexOf("/* Solaris Studio installed-app chrome"),
    );

    expect(bootSection).toContain('url("/solaris-studio-mark.png")');
    expect(bootSection.toLowerCase()).not.toContain("tsbc");
  });

  it("keeps the first-paint guard installed-app-only", () => {
    expect(root).toContain('window.matchMedia("(display-mode: standalone)").matches');
    expect(root).toContain('window.matchMedia("(display-mode: window-controls-overlay)").matches');
    expect(root).toContain("navigator.standalone === true");
    expect(root).toContain("if (!installed) return");
  });
});
