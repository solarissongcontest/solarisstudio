import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 PWA install prompt storage resilience", () => {
  const prompt = source("src/components/app/AppInstallPrompt.tsx");

  it("treats browser storage as optional shell state", () => {
    expect(prompt).toContain("optionalBrowserStorage");
    expect(prompt).toContain("readOptionalStorage");
    expect(prompt).toContain("writeOptionalStorage");
    expect(prompt).toContain("try {");
    expect(prompt).toContain("catch {");
    expect(prompt).not.toContain("window.localStorage.getItem");
    expect(prompt).not.toContain("window.localStorage.setItem");
    expect(prompt).not.toContain("window.sessionStorage.getItem");
    expect(prompt).not.toContain("window.sessionStorage.setItem");
  });

  it("preserves bounded visit and dismissal policy when storage works", () => {
    expect(prompt).toContain("MIN_VISITS = 2");
    expect(prompt).toContain("REVEAL_DELAY_MS = 8_000");
    expect(prompt).toContain("SESSION_COUNTED_KEY");
    expect(prompt).toContain("VISIT_COUNT_KEY");
    expect(prompt).toContain("DISMISSED_KEY");
    expect(prompt).toContain("visits >= MIN_VISITS");
  });

  it("keeps optional persistence failure out of the install and dismiss control flow", () => {
    expect(prompt).toContain(
      "Install-prompt persistence is optional. Storage restrictions must not break Solaris.",
    );
    expect(prompt).toContain(
      'writeOptionalStorage(optionalBrowserStorage("localStorage"), DISMISSED_KEY, "1")',
    );
    expect(prompt).toContain("setDismissed(true)");
    expect(prompt).toContain('if (choice.outcome === "accepted") dismiss()');
  });

  it("retains critical and immersive route suppression", () => {
    expect(prompt).toContain("installPromptAllowedOnPath");
    expect(prompt).toContain("screen.behavior.criticalTask");
    expect(prompt).toContain("screen.behavior.immersive");
  });
});
