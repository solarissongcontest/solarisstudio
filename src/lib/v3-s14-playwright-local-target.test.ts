import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { requireLocalPlaywrightTarget, requireLocalPlaywrightSupabaseEnvironment } from "../../scripts/lib/require-local-playwright-target.mjs";

const configs = {
  "playwright.s14-grand-final.config.ts": "http://127.0.0.1:4177",
  "playwright.s14-grand-final-results.config.ts": "http://127.0.0.1:4178",
  "playwright.pr455-preflight.config.ts": "http://127.0.0.1:4173",
} as const;

describe("standalone Playwright hosted-front-end isolation", () => {
  it("fails closed on hosted, ambiguous and credential-bearing browser targets", () => {
    for (const url of [
      "https://solaris.example", "https://some-project.supabase.co",
      "http://localhost.evil.test", "http://127.0.0.1.evil.test",
      "http://localhost@solaris.example", "http://192.168.0.1:4177",
      "http://0.0.0.0:4177", "file:///tmp/index.html", "",
      "http://user:pass@localhost:4177", "http://localhost:4177/preview",
      "http://localhost:4177/?next=https://hosted.example",
    ]) {
      expect(() => requireLocalPlaywrightTarget(url, "http://127.0.0.1:4177"), url).toThrow(/Playwright safety/);
    }
  });

  it("keeps current S14 and Organizer preflight loopback origins operational", () => {
    for (const fallback of Object.values(configs)) {
      expect(requireLocalPlaywrightTarget(undefined, fallback)).toBe(fallback);
    }
    expect(requireLocalPlaywrightTarget("http://localhost:4177", "http://127.0.0.1:4177")).toBe("http://localhost:4177");
    expect(requireLocalPlaywrightTarget("http://[::1]:4178", "http://127.0.0.1:4178")).toBe("http://[::1]:4178");
  });

  it("requires the fail-closed guard in every standalone S14 and PR455 runner", () => {
    for (const [path, fallback] of Object.entries(configs)) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain('import { requireLocalPlaywrightTarget, requireLocalPlaywrightSupabaseEnvironment } from "./scripts/lib/require-local-playwright-target.mjs";');
      expect(source, path).toContain(`requireLocalPlaywrightTarget(process.env.E2E_BASE_URL, "${fallback}")`);
      expect(source, path).not.toContain("process.env.E2E_BASE_URL ??");
    }
  });

  it("requires local Supabase URLs for all standalone browser suites", () => {
    const local = {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_URL: "http://127.0.0.1:54321",
      E2E_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
      CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
    };
    expect(requireLocalPlaywrightSupabaseEnvironment(local)).toBe(true);
    for (const key of Object.keys(local)) {
      expect(() => requireLocalPlaywrightSupabaseEnvironment({ ...local, [key]: "" }), key).toThrow(/Playwright safety/);
    }
    expect(() => requireLocalPlaywrightSupabaseEnvironment({ ...local, DB_URL: "postgresql://postgres:secret@localhost:54322/postgres?host=db.remote.test" })).toThrow(/authority override/);
    for (const [path] of Object.entries(configs)) {
      expect(readFileSync(path, "utf8")).toContain("requireLocalPlaywrightSupabaseEnvironment(process.env);");
    }
  });
});
