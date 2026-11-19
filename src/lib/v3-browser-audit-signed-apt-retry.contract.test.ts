import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/browser-audit.yml", "utf8");
const runtime = readFileSync(".github/scripts/v3-browser-playwright-container.sh", "utf8");

describe("V3 Browser audit reproducible pinned OS/browser runtime", () => {
  it("launches both real Playwright engines in a version-matched system-library image", () => {
    expect(workflow).toContain("docker pull mcr.microsoft.com/playwright:v1.55.0-noble");
    expect(runtime).toContain('image="mcr.microsoft.com/playwright:v1.55.0-noble"');
    expect(workflow).toContain("import { chromium, webkit } from '@playwright/test'");
    expect(workflow).toContain("await engine.launch({ headless: true })");
    expect(workflow).toContain("PASS: pinned container ");
    expect(workflow).not.toContain("playwright install --with-deps");
    expect(workflow).not.toContain("apt-get -o APT::Update::Error-Mode=any update");
  });

  it("preserves exact-SHA checkout, Supabase loopback proof and real Playwright tests", () => {
    expect(workflow).toContain("BROWSER_AUDIT_SOURCE_SHA");
    expect(workflow).toContain('if [ "$checkout_sha" != "$expected" ]; then');
    expect(workflow).toContain("Start isolated local Supabase for browser audit");
    expect(workflow).toContain("SUPABASE_PROJECT_ID: local");
    expect(workflow).toContain("bash .github/scripts/v3-browser-playwright-container.sh run node --input-type=module");
    expect(workflow).toContain("bash .github/scripts/v3-browser-playwright-container.sh run ./node_modules/.bin/playwright test --config=playwright.pr455-preflight.config.ts");
    expect(workflow).toContain("bash .github/scripts/v3-browser-playwright-container.sh run ./node_modules/.bin/playwright test");
  });

  it("refuses hosted URLs and never forwards all runner environment variables", () => {
    expect(runtime).toContain('mode=');
    expect(runtime).toContain('network="none"');
    expect(runtime).toContain('network="host"');
    expect(runtime).toContain("Browser container refused non-local Supabase target");
    expect(runtime).toContain("url.username || url.password");
    expect(runtime).toContain('args+=(--env "$key")');
    expect(runtime).toContain('--env "SUPABASE_PROJECT_ID=local"');
    expect(runtime).toContain('--env "SUPABASE_PROJECT_REF=local"');
    expect(runtime).not.toContain("--env-file");
    expect(runtime).not.toContain("--privileged");
    expect(runtime).not.toContain("--env GITHUB_TOKEN");
  });
});
