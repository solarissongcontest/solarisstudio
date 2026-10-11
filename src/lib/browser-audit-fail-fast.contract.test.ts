import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const playwrightConfig = source("playwright.config.ts");
const organizerAudit = source("e2e/organizer-routes.e2e.ts");
const publicAudit = source("e2e/public-routes.e2e.ts");
const auditHelpers = source("e2e/audit-helpers.ts");
const authenticatedRoute = source("src/routes/_authenticated/route.tsx");
const adminRoute = source("src/routes/_authenticated/admin/route.tsx");
const browserAuditWorkflow = source(".github/workflows/browser-audit.yml");

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

  it("isolates public route crawls so delayed navigation from one route cannot abort the next", () => {
    expect(publicAudit.match(/const routePage = await context\.newPage\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(publicAudit).toContain("await routePage.close();");
  });

  it("gives each selected static public route its own timeout while preserving PR smoke scope", () => {
    expect(publicAudit).toContain("const publicRouteAuditSet = fullAudit");
    expect(publicAudit).toContain("? [...STATIC_PUBLIC_ROUTES].sort()");
    expect(publicAudit).toContain(": [...PR_SMOKE_PUBLIC_ROUTES];");
    expect(publicAudit).toContain("for (const route of publicRouteAuditSet)");
    expect(publicAudit).toContain('test(`public route ${route} passes at this viewport`');
    expect(publicAudit).not.toContain('test("public route families pass at this viewport"');
  });

  it("builds Browser Audit against the isolated local identity and serves the compiled Worker locally", () => {
    const localStack = browserAuditWorkflow.indexOf("- name: Start isolated local Supabase for browser audit");
    const localBuild = browserAuditWorkflow.indexOf("- name: Build audit application against isolated local Supabase");
    const localWorker = browserAuditWorkflow.indexOf("bunx wrangler@4.141.0 dev --local --no-bundle --ip 127.0.0.1 --port 4173");

    expect(localStack).toBeGreaterThanOrEqual(0);
    expect(localBuild).toBeGreaterThan(localStack);
    expect(localWorker).toBeGreaterThan(localBuild);
    expect(browserAuditWorkflow).toContain('"$VITE_SUPABASE_URL"');
    expect(browserAuditWorkflow).toContain('"$VITE_CONFIRMATIONS_SUPABASE_URL"');
    expect(browserAuditWorkflow).toContain("Refusing audit build with hosted/non-local Supabase URL");
    expect(browserAuditWorkflow).toContain("Refusing audit server with hosted Supabase URL");
    expect(browserAuditWorkflow).not.toContain("bun run preview --host 127.0.0.1 --port 4173 --strictPort");
    expect(browserAuditWorkflow).not.toContain("bun run dev --host 127.0.0.1 --port 4173 --strictPort");
  });

  it("injects local Supabase into the Worker runtime and proves SSR routes cannot escape it", () => {
    expect(browserAuditWorkflow).toContain('--var "SUPABASE_URL:$SUPABASE_URL"');
    expect(browserAuditWorkflow).toContain('--var "SUPABASE_PUBLISHABLE_KEY:$SUPABASE_PUBLISHABLE_KEY"');
    expect(browserAuditWorkflow).toContain('--var "CONFIRMATIONS_SUPABASE_URL:$CONFIRMATIONS_SUPABASE_URL"');
    expect(browserAuditWorkflow).toContain("- name: Verify server-side routes use local Supabase identity");
    expect(browserAuditWorkflow).toContain("Audit Worker sitemap escaped local Supabase data");
    expect(browserAuditWorkflow).toContain("Sitemap did not expose representative local Country/Wiki routes");
  });

  it("measures a hidden native file input through its real wrapping-label target", () => {
    expect(auditHelpers).toContain('["checkbox", "radio", "file"].includes(node.type)');
    expect(auditHelpers).toContain('rect = node.closest("label")!.getBoundingClientRect();');
  });

  it("does not manage authentication or Organizer authorization with raw async component setState", () => {
    expect(authenticatedRoute).toContain('useQuery<User | null>({');
    expect(authenticatedRoute).not.toContain("setState({ status: \"authenticated\"");
    expect(authenticatedRoute).not.toContain("setState({ status: \"redirecting\"");

    const organizerGateStart = adminRoute.indexOf("function OrganizerAccessGate");
    const organizerGateEnd = adminRoute.indexOf("export const Route", organizerGateStart);
    const organizerGate = adminRoute.slice(organizerGateStart, organizerGateEnd);
    expect(organizerGateStart).toBeGreaterThanOrEqual(0);
    expect(organizerGate).toContain('useQuery<boolean>({');
    expect(organizerGate).toContain('queryKey: ["organizer-access-gate", user.id]');
    expect(organizerGate).not.toContain("useState(");
    expect(organizerGate).not.toContain("setState(");
  });
});
