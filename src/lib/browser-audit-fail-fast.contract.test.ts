import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const playwrightConfig = source("playwright.config.ts");
const organizerAudit = source("e2e/organizer-routes.e2e.ts");
const auditHelpers = source("e2e/audit-helpers.ts");
const authenticatedRoute = source("src/routes/_authenticated/route.tsx");

describe("PR Browser Audit fail-fast and route isolation contract", () => {
  it("fails PR smoke quickly without retries while preserving exhaustive audit behavior", () => {
    expect(playwrightConfig).toContain('process.env.GITHUB_EVENT_NAME === "pull_request"');
    expect(playwrightConfig).toContain("timeout: prSmoke ? 90_000");
    expect(playwrightConfig).toContain("retries: prSmoke ? 0");
    expect(playwrightConfig).toContain("maxFailures: prSmoke ? 1 : 0");
  });

  it("isolates Organizer route crawls so one route cannot cancel the next navigation", () => {
    expect(organizerAudit.match(/const routePage = await context\.newPage\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(organizerAudit).toContain("await routePage.close();");
  });

  it("measures a hidden native file input through its real wrapping-label target", () => {
    expect(auditHelpers).toContain('["checkbox", "radio", "file"].includes(node.type)');
    expect(auditHelpers).toContain('rect = node.closest("label")!.getBoundingClientRect();');
  });

  it("does not manage authenticated session bootstrap with a raw async component setState", () => {
    expect(authenticatedRoute).toContain('useQuery<User | null>({');
    expect(authenticatedRoute).not.toContain("setState({ status: \"authenticated\"");
    expect(authenticatedRoute).not.toContain("setState({ status: \"redirecting\"");
  });
});
