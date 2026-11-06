import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { requireLoopbackBrowserTarget } from "../../e2e/browser-target-isolation";

describe("primary Browser Audit target isolation", () => {
  it.each([
    "http://127.0.0.1:4173",
    "http://localhost:4173/",
    "http://[::1]:4173",
    "https://127.0.0.1:8443",
  ])("accepts an explicit loopback origin: %s", (input) => {
    expect(requireLoopbackBrowserTarget(input)).toBe(new URL(input).origin);
  });

  it.each([
    "https://solarissongcontest.pages.dev",
    "https://production.supabase.co",
    "https://localhost.evil.example",
    "https://127.0.0.1.evil.example",
    "http://192.168.1.10:4173",
    "http://0.0.0.0:4173",
    "http://example.com@remote.example:4173",
    "//remote.example",
    "ftp://127.0.0.1:4173",
    "http://127.0.0.1:4173/redirect",
    "http://127.0.0.1:4173/?redirect=https://production.supabase.co",
    "http://127.0.0.1:4173/#redirect",
    "http://user:pass@127.0.0.1:4173",
    "",
  ])("rejects a hosted, ambiguous or redirected audit target: %s", (input) => {
    expect(() => requireLoopbackBrowserTarget(input)).toThrow(/Playwright safety/);
  });

  it("is wired to the primary config before the browser or web server starts", () => {
    const config = readFileSync(new URL("../../playwright.config.ts", import.meta.url), "utf8");
    expect(config).toContain('import { requireLoopbackBrowserTarget } from "./e2e/browser-target-isolation";');
    expect(config).toContain('const baseURL = requireLoopbackBrowserTarget(process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173");');
    expect(config.indexOf("const baseURL = requireLoopbackBrowserTarget")).toBeLessThan(
      config.indexOf("export default defineConfig("),
    );
  });
});
