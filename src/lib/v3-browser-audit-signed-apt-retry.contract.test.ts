import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/browser-audit.yml", "utf8");

describe("V3 Browser audit signed dependency bootstrap", () => {
  it("retries transient Ubuntu mirror failures without accepting stale package indexes", () => {
    expect(workflow).toContain("for attempt in 1 2 3; do");
    expect(workflow).toContain("if sudo apt-get -o APT::Update::Error-Mode=any update; then");
    expect(workflow).toContain('if [[ "$index_ready" -ne 1 ]]; then');
    expect(workflow).toContain("Signed Ubuntu apt index unavailable after three strict attempts");
    expect(workflow).toContain("exit 1");
    expect(workflow).toContain("bunx playwright install --with-deps chromium webkit");
    expect(workflow).not.toMatch(/apt-get[^\n]*(?:--allow-unauthenticated|--allow-insecure-repositories)/);
    expect(workflow).not.toMatch(/apt-get[^\n]*update[^\n]*\|\|\s*true/);
  });

  it("retains local-only database and exact checkout checks after dependency installation", () => {
    expect(workflow).toContain("BROWSER_AUDIT_SOURCE_SHA");
    expect(workflow).toContain('if [ "$checkout_sha" != "$expected" ]; then');
    expect(workflow).toContain("Start isolated local Supabase for browser audit");
    expect(workflow).toContain("SUPABASE_PROJECT_ID: local");
  });
});
