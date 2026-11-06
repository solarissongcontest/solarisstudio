import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed-app suggestion lifecycle", () => {
  const prompt = source("src/components/app/AppInstallPrompt.tsx");

  it("clears the browser suggestion after successful installation", () => {
    expect(prompt).toContain('window.addEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain('window.removeEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain("writeOptionalStorage(localStorage, DISMISSED_KEY, \"1\")");
    expect(prompt).toContain("setInstallEvent(null)");
    expect(prompt).toContain("setDismissed(true)");
    expect(prompt).toContain("setEligible(false)");
  });

  it("clears any retained native prompt when Solaris explicitly dismisses it", () => {
    const dismissStart = prompt.indexOf("const dismiss = () => {");
    const installStart = prompt.indexOf("const install = async () => {");
    const dismissBlock = prompt.slice(dismissStart, installStart);

    expect(dismissBlock).toContain("setInstallEvent(null)");
    expect(dismissBlock).toContain("setDismissed(true)");
    expect(dismissBlock).toContain("setEligible(false)");
  });

  it("never retains a consumed beforeinstallprompt event after either native outcome", () => {
    const installStart = prompt.indexOf("const install = async () => {");
    const renderStart = prompt.indexOf("\n  return (", installStart);
    const installBody = prompt.slice(installStart, renderStart);
    const choiceIndex = installBody.indexOf("await installEvent.userChoice");
    const clearEventIndex = installBody.indexOf("setInstallEvent(null)");
    const clearEligibilityIndex = installBody.indexOf("setEligible(false)");
    const acceptedIndex = installBody.indexOf('choice.outcome === "accepted"');

    expect(installStart).toBeGreaterThanOrEqual(0);
    expect(renderStart).toBeGreaterThan(installStart);
    expect(choiceIndex).toBeGreaterThanOrEqual(0);
    expect(clearEventIndex).toBeGreaterThan(choiceIndex);
    expect(clearEligibilityIndex).toBeGreaterThan(choiceIndex);
    expect(acceptedIndex).toBeGreaterThan(clearEventIndex);
    expect(acceptedIndex).toBeGreaterThan(clearEligibilityIndex);
  });

  it("retains critical-task, immersive and installed-mode suppression", () => {
    expect(prompt).toContain("!screen.behavior.criticalTask && !screen.behavior.immersive");
    expect(prompt).toContain("isAppMode ||");
    expect(prompt).toContain("!installPromptAllowedOnPath(pathname)");
  });
});
