import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/browser-audit.yml", "utf8");

describe("V3 Browser Audit exact-main coverage and fail-closed dependency recovery", () => {
  it("does not replace queued main commit evidence with later branch pushes", () => {
    expect(workflow).toContain(
      "group: browser-audit-${{ github.event_name == 'push' && github.sha || github.ref }}",
    );
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
    expect(workflow).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(workflow).toContain('checkout_sha="$(git rev-parse HEAD');
  });

  it("retries transient signed Ubuntu index errors but never accepts stale indexes", () => {
    expect(workflow).toContain("APT::Update::Error-Mode=any update");
    expect(workflow).toContain("for attempt in 1 2 3; do");
    expect(workflow).toContain('if [[ "$fresh_index" -ne 1 ]]; then');
    expect(workflow).toContain('if [[ "$installed" -ne 1 ]]; then');
    expect(workflow).toContain("bunx playwright install --with-deps chromium webkit");
    expect(workflow).not.toContain("apt-get update || true");
    expect(workflow).not.toContain("playwright install --with-deps chromium || true");
  });

  it("retains mandatory local-only Supabase and browser execution gates", () => {
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("Refusing browser audit against non-local Supabase URL");
    expect(workflow).toContain("requireLocalPlaywrightSupabaseEnvironment");
    expect(workflow).toContain("Verify browser receives the local Supabase identity");
    expect(workflow).toContain("Run Playwright");
  });
});
