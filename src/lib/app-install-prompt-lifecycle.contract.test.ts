import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed-app suggestion lifecycle", () => {
  it("clears the browser suggestion after the app is installed", () => {
    const prompt = source("src/components/app/AppInstallPrompt.tsx");

    expect(prompt).toContain('window.addEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain('window.removeEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain('window.localStorage.setItem(DISMISSED_KEY, "1")');
    expect(prompt).toContain("setInstallEvent(null)");
    expect(prompt).toContain("setDismissed(true)");
  });

  it("retains critical-task, immersive and installed-mode suppression", () => {
    const prompt = source("src/components/app/AppInstallPrompt.tsx");

    expect(prompt).toContain("!screen.behavior.criticalTask && !screen.behavior.immersive");
    expect(prompt).toContain("isAppMode ||");
    expect(prompt).toContain("!installPromptAllowedOnPath(pathname)");
  });
});
