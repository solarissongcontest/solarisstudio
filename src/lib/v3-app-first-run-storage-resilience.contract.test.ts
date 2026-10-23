import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function functionBody(text: string, startMarker: string, endMarker: string) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return text.slice(start, end);
}

describe("V3 installed-app first-run storage resilience", () => {
  const firstRun = source("src/components/app/AppFirstRun.tsx");

  it("keeps optional local persistence fail-soft", () => {
    const read = functionBody(
      firstRun,
      "function readFirstRunComplete()",
      "function persistFirstRunComplete()",
    );
    const write = functionBody(
      firstRun,
      "function persistFirstRunComplete()",
      "export function appFirstRunComplete()",
    );

    expect(read).toContain('typeof window === "undefined"');
    expect(read).toContain("try {");
    expect(read).toContain("window.localStorage.getItem(APP_FIRST_RUN_COMPLETE_KEY)");
    expect(read).toContain("} catch {");
    expect(read).toContain("return false;");

    expect(write).toContain('typeof window === "undefined"');
    expect(write).toContain("try {");
    expect(write).toContain('window.localStorage.setItem(APP_FIRST_RUN_COMPLETE_KEY, "1")');
    expect(write).toContain("} catch {");

    expect(firstRun.match(/window\.localStorage\.getItem/g) ?? []).toHaveLength(1);
    expect(firstRun.match(/window\.localStorage\.setItem/g) ?? []).toHaveLength(1);
    expect(firstRun).not.toContain("window.sessionStorage");
  });

  it("uses the fail-soft read for both helper callers and mounted onboarding", () => {
    const publicHelper = functionBody(
      firstRun,
      "export function appFirstRunComplete()",
      "export function AppFirstRun(",
    );
    const effect = functionBody(firstRun, "useEffect(() => {", "  const complete = () => {");

    expect(publicHelper).toContain("return readFirstRunComplete();");
    expect(effect).toContain("if (readFirstRunComplete()) return;");
    expect(effect).not.toContain("window.localStorage");
  });

  it("never lets a failed persistence write trap the first-run sheet open", () => {
    const complete = functionBody(firstRun, "  const complete = () => {", "\n  };",);

    const persistIndex = complete.indexOf("persistFirstRunComplete();");
    const closeIndex = complete.indexOf("setOpen(false);");
    const callbackIndex = complete.indexOf("onComplete?.();");

    expect(persistIndex).toBeGreaterThanOrEqual(0);
    expect(closeIndex).toBeGreaterThan(persistIndex);
    expect(callbackIndex).toBeGreaterThan(closeIndex);
  });

  it("preserves the focused-workflow and authentication suppression boundary", () => {
    expect(firstRun).toContain('pathname === "/app-launch"');
    expect(firstRun).toContain('pathname === "/admin"');
    expect(firstRun).toContain('pathname.startsWith("/admin/")');
    expect(firstRun).toContain('/^\\/(auth|reset|recover)(\\/|$)/.test(pathname)');
    expect(firstRun).toContain("!screen.behavior.criticalTask");
    expect(firstRun).toContain("!screen.behavior.immersive");
  });
});
