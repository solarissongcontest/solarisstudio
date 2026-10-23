import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 optional PWA shell", () => {
  const storage = source("src/lib/app-optional-browser-storage.ts");
  const prompt = source("src/components/app/AppInstallPrompt.tsx");
  const firstRun = source("src/components/app/AppFirstRun.tsx");

  it("centralizes optional persistence behind fail-soft storage", () => {
    expect(storage).toContain('type BrowserStorageName = "localStorage" | "sessionStorage"');
    expect(storage).toContain("catch {");
    expect(storage).toContain("return undefined");
    expect(storage).toContain("return false");

    for (const consumer of [prompt, firstRun]) {
      expect(consumer).toContain('from "@/lib/app-optional-browser-storage"');
      expect(consumer).not.toContain("window.localStorage.getItem");
      expect(consumer).not.toContain("window.localStorage.setItem");
      expect(consumer).not.toContain("window.sessionStorage.getItem");
      expect(consumer).not.toContain("window.sessionStorage.setItem");
    }
  });

  it("fails closed on optional install promotion when storage is unavailable", () => {
    expect(prompt).toContain("storedVisits === undefined");
    expect(prompt).toContain("sessionCounted === undefined");
    expect(prompt).toContain("storedDismissed === undefined");
    expect(prompt).toContain("setDismissed(true)");
    expect(prompt).toContain("setEligible(false)");
  });

  it("keeps first-run education from trapping or reopening the installed app", () => {
    expect(firstRun).toContain('return stored === undefined || stored === "1"');
    expect(firstRun).toContain("completedThisSession");
    expect(firstRun).toContain("setCompletedThisSession(true)");
    expect(firstRun).toContain("setOpen(false)");
    expect(firstRun).toContain("onComplete?.()");
  });

  it("clears native install prompt state on install and explicit dismissal", () => {
    expect(prompt).toContain('window.addEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain('window.removeEventListener("appinstalled", installedHandler)');
    expect(prompt).toContain("setInstallEvent(null)");
    expect(prompt).toContain("setEligible(false)");
  });

  it("retains focused-workflow and auth suppression for optional overlays", () => {
    expect(firstRun).toContain('pathname === "/app-launch"');
    for (const consumer of [prompt, firstRun]) {
      expect(consumer).toContain('pathname === "/admin"');
      expect(consumer).toContain('pathname.startsWith("/admin/")');
      expect(consumer).toContain('/^\\/(auth|reset|recover)(\\/|$)/.test(pathname)');
      expect(consumer).toContain("screen.behavior.criticalTask");
      expect(consumer).toContain("screen.behavior.immersive");
    }
  });
});
