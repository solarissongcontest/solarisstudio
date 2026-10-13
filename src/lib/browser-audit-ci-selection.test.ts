import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const compiled = ts.transpileModule(readFileSync("playwright.config.ts", "utf8"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

function configFor(environment: Record<string, string | undefined>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, {
    exports,
    process: {
      env: {
        CI: "true",
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_URL: "http://127.0.0.1:54321",
        E2E_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
        CONFIRMATIONS_SUPABASE_URL: "http://127.0.0.1:54321",
        SOLARIS_E2E_BYPASS_MAINTENANCE: "1",
        ...environment,
      },
    },
    URL,
    require: (name: string) => {
      if (name === "@playwright/test") {
        return { defineConfig: (config: unknown) => config, devices: {} };
      }
      if (name === "./src/lib/maintenance") {
        return { GLOBAL_MAINTENANCE_MODE: false };
      }
      throw new Error(`Unexpected config dependency: ${name}`);
    },
  });
  return exports.default as {
    projects: Array<{ name: string }>;
    timeout: number;
    retries: number;
    grepInvert?: RegExp;
  };
}

describe("Browser Audit CI selection", () => {
  it.each([
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" },
  ])("bounds routine integration while retaining required smoke projects: %j", (env) => {
    const config = configFor(env);
    expect(config.projects.map(({ name }) => name)).toEqual([
      "public-390",
      "public-1440",
      "personality-390",
      "account-states",
      "ios-pwa-portrait",
    ]);
    expect(config.timeout).toBe(90_000);
    expect(config.retries).toBe(0);
  });

  it.each([
    { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main" },
    { GITHUB_EVENT_NAME: "pull_request", GITHUB_HEAD_REF: "feature/public-final-quality" },
  ])("retains exhaustive explicit certification: %j", (env) => {
    const config = configFor({ ...env, E2E_FULL_AUDIT: "1" });
    expect(config.projects.length).toBeGreaterThan(20);
    expect(config.projects.map(({ name }) => name)).toContain("public-320");
    expect(config.grepInvert).toBeUndefined();
  });

  it("keeps routine main bounded even with an inherited exhaustive request", () => {
    const config = configFor({
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      E2E_FULL_AUDIT: "1",
    });
    expect(config.projects).toHaveLength(5);
  });

  it.each(["SUPABASE_URL", "VITE_CONFIRMATIONS_SUPABASE_URL", "EXTRA_SUPABASE_URL"])(
    "refuses hosted Supabase in %s before selecting any tests",
    (name) => {
      expect(() => configFor({ [name]: "https://example.supabase.co" })).toThrow(/Refusing/);
    },
  );

  it("refuses missing local Supabase configuration", () => {
    expect(() => configFor({ E2E_SUPABASE_URL: "" })).toThrow(/Missing/);
  });
});
