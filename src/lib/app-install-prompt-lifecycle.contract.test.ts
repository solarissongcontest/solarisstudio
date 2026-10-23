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

  it("clears any retained native prompt when Solaris dismisses or accepts it", () => {
    const dismissStart = prompt.indexOf("const dismiss = () => {");
    const installStart = prompt.indexOf("const install = async () => {");
    const dismissBlock = prompt.slice(dismissStart, installStart);

    expect(dismissBlock).toContain("setInstallEvent(null)");
    expect(dismissBlock).toContain("setDismissed(true)");
    expect(prompt).toContain('if (choice.outcome === "accepted") dismiss()');
  });

  it("retains critical-task, immersive and installed-mode suppression", () => {
    expect(prompt).toContain("!screen.behavior.criticalTask && !screen.behavior.immersive");
    expect(prompt).toContain("isAppMode ||");
    expect(prompt).toContain("!installPromptAllowedOnPath(pathname)");
  });
});
