import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 optional shell persistence resilience", () => {
  const storage = source("src/lib/app-optional-browser-storage.ts");
  const prompt = source("src/components/app/AppInstallPrompt.tsx");
  const firstRun = source("src/components/app/AppFirstRun.tsx");

  it("centralizes fail-soft browser storage access", () => {
    expect(storage).toContain('type BrowserStorageName = "localStorage" | "sessionStorage"');
    expect(storage).toContain("optionalBrowserStorage");
    expect(storage).toContain("readOptionalStorage");
    expect(storage).toContain("writeOptionalStorage");
    expect(storage).toContain("return undefined");
    expect(storage).toContain("return false");
    expect(storage).toContain("catch {");

    for (const consumer of [prompt, firstRun]) {
      expect(consumer).toContain('from "@/lib/app-optional-browser-storage"');
      expect(consumer).not.toContain("window.localStorage.getItem");
      expect(consumer).not.toContain("window.localStorage.setItem");
      expect(consumer).not.toContain("window.sessionStorage.getItem");
      expect(consumer).not.toContain("window.sessionStorage.setItem");
    }
  });

  it("fails closed on optional install promotion when persistence is unavailable or unwritable", () => {
    expect(prompt).toContain("storedVisits === undefined");
    expect(prompt).toContain("sessionCounted === undefined");
    expect(prompt).toContain("storedDismissed === undefined");
    expect(prompt).toContain("const visitStored = writeOptionalStorage");
    expect(prompt).toContain("const sessionStored = writeOptionalStorage");
    expect(prompt).toContain("if (!visitStored || !sessionStored)");
    expect(prompt).toContain("setDismissed(true)");
    expect(prompt).toContain("setEligible(false)");
  });

  it("preserves bounded install-prompt policy when storage works", () => {
    expect(prompt).toContain("MIN_VISITS = 2");
    expect(prompt).toContain("REVEAL_DELAY_MS = 8_000");
    expect(prompt).toContain("SESSION_COUNTED_KEY");
    expect(prompt).toContain("VISIT_COUNT_KEY");
    expect(prompt).toContain("DISMISSED_KEY");
    expect(prompt).toContain("visits >= MIN_VISITS");
  });

  it("never makes unpersistable first-run education an app-wide repeated blocker", () => {
    expect(firstRun).toContain('return stored === undefined || stored === "1"');
    expect(firstRun).toContain("completedThisSession");
    expect(firstRun).toContain("setCompletedThisSession(true)");
    expect(firstRun).toContain("writeOptionalStorage(");
    expect(firstRun).toContain("setOpen(false)");
    expect(firstRun).toContain("onComplete?.()");
  });

  it("retains critical and immersive route suppression for optional overlays", () => {
    for (const consumer of [prompt, firstRun]) {
      expect(consumer).toContain("screen.behavior.criticalTask");
      expect(consumer).toContain("screen.behavior.immersive");
    }
  });
});
