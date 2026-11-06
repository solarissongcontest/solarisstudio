import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { assertLocalBrowserAuditTarget } from "../../e2e/pr455-browser-preflight.global";

describe("S14 / Browser Audit preflight target isolation", () => {
  it("allows only explicit unauthenticated HTTP(S) loopback browser targets", () => {
    for (const target of [
      "http://127.0.0.1:4173",
      "http://localhost:4173/",
      "http://[::1]:4173/",
      "https://localhost:4173/organizer",
    ]) {
      expect(() => assertLocalBrowserAuditTarget(target), target).not.toThrow();
    }
  });

  it("rejects hosted frontends even when Supabase test variables would be local", () => {
    for (const target of [
      "https://solaris.example",
      "https://project.supabase.co",
      "http://localhost.evil.example:4173",
      "http://localhost:4173@evil.example",
      "http://evil.example@localhost:4173",
      "ftp://localhost:4173",
      "file://localhost/fixture",
      "http://0.0.0.0:4173",
      "http://[::2]:4173",
      "",
      "not-a-url",
    ]) {
      expect(() => assertLocalBrowserAuditTarget(target), target).toThrow(
        /\[Browser Audit safety\]/,
      );
    }
  });

  it("validates the browser target before either preflight bypass flag", () => {
    const source = readFileSync(
      resolve(process.cwd(), "e2e/pr455-browser-preflight.global.ts"),
      "utf8",
    );
    const guard = source.indexOf("  assertLocalBrowserAuditTarget();");
    const childBypass = source.indexOf('if (process.env.SOLARIS_PR455_PREFLIGHT_CHILD === "1") return;');
    const alreadyPassedBypass = source.indexOf('if (process.env.SOLARIS_PR455_PREFLIGHT_ALREADY_PASSED === "1") return;');

    expect(guard).toBeGreaterThan(-1);
    expect(childBypass).toBeGreaterThan(guard);
    expect(alreadyPassedBypass).toBeGreaterThan(guard);
  });
});
