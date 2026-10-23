import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed-app suggestion lifecycle", () => {
  it("clears the browser suggestion after the app is installed without bypassing fail-soft storage", () => {
    const prompt = source("src/components/app/AppInstallPrompt.tsx");

    expect(prompt).toContain('window.addEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain('window.removeEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain("writeOptionalStorage(localStorage, DISMISSED_KEY, \"1\")");
    expect(prompt).toContain("setInstallEvent(null)");
    expect(prompt).toContain("setEligible(false)");
    expect(prompt).toContain("setDismissed(true)");
    expect(prompt).not.toContain('window.localStorage.setItem(DISMISSED_KEY, "1")');
  });

  it("retains critical-task, immersive and installed-mode suppression", () => {
    const prompt = source("src/components/app/AppInstallPrompt.tsx");

    expect(prompt).toContain("!screen.behavior.criticalTask && !screen.behavior.immersive");
    expect(prompt).toContain("isAppMode ||");
    expect(prompt).toContain("!installPromptAllowedOnPath(pathname)");
  });

  it("clears retained native prompt state on explicit dismissal", () => {
    const prompt = source("src/components/app/AppInstallPrompt.tsx");
    const dismissStart = prompt.indexOf("const dismiss = () => {");
    const installStart = prompt.indexOf("const install = async () => {");
    const dismissBody = prompt.slice(dismissStart, installStart);

    expect(dismissStart).toBeGreaterThanOrEqual(0);
    expect(installStart).toBeGreaterThan(dismissStart);
    expect(dismissBody).toContain("writeOptionalStorage");
    expect(dismissBody).toContain("setInstallEvent(null)");
    expect(dismissBody).toContain("setEligible(false)");
    expect(dismissBody).toContain("setDismissed(true)");
  });
});
