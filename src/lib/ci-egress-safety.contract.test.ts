import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflowFiles = () => {
  const workflowDir = resolve(process.cwd(), ".github/workflows");
  return readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name));
};

describe("CI egress safety contracts", () => {
  it("rejects hosted Supabase endpoints or Supabase secrets from every GitHub Actions workflow", () => {
    for (const name of workflowFiles()) {
      const content = source(`.github/workflows/${name}`);
      expect(content, name).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
      expect(content, name).not.toMatch(/\$\{\{\s*secrets\.[^}\n]*SUPABASE/i);
    }
  });

  it("keeps every Playwright workflow isolated from hosted Supabase", () => {
    const playwrightWorkflows = workflowFiles()
      .map((name) => ({ name, content: source(`.github/workflows/${name}`) }))
      // Merely executing the offline guard contract is not a browser run.
      // Select actual Playwright installs/test invocations so Quality's
      // negative-tests-only job does not masquerade as an E2E workflow.
      .filter(({ content }) => /(?:bunx|npx|pnpm exec|yarn|bun run)\s+playwright\s+(?:test|install)|Run responsive browser audit/i.test(content));

    expect(playwrightWorkflows.length).toBeGreaterThan(0);

    for (const { name, content } of playwrightWorkflows) {
      expect(content, name).toContain("supabase start");
      expect(content, name).toContain("http://127.0.0.1:54321");
      expect(content, name).toContain("Refusing audit server with hosted Supabase URL");
      expect(content, name).not.toContain("secrets.E2E_SUPABASE_URL");
      expect(content, name).not.toContain("secrets.E2E_SUPABASE_PUBLISHABLE_KEY");
      expect(content, name).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
    }
  });

  it("requires offline negative tests before Quality builds and Browser Audit navigation", () => {
    const quality = source(".github/workflows/ci.yml");
    const browser = source(".github/workflows/browser-audit.yml");
    for (const workflow of [quality, browser]) {
      expect(workflow).toContain("node --test scripts/lib/require-local-playwright-target.contract.mjs");
    }
    expect(quality.indexOf("node --test scripts/lib/require-local-playwright-target.contract.mjs"))
      .toBeLessThan(quality.indexOf("run: bun run build"));
    expect(browser).toContain("requireLocalPlaywrightSupabaseEnvironment(process.env)");
    expect(browser).toContain("bun run scripts/check-v3-production-isolation.ts");
    const config = source("playwright.config.ts");
    expect(config).toContain("requireLocalPlaywrightSupabaseEnvironment(process.env)");
    expect(config).toContain('requireLocalPlaywrightTarget(process.env.E2E_BASE_URL, "http://127.0.0.1:4173")');
    expect(config).not.toContain("const baseURL = process.env.E2E_BASE_URL ??");
  });

  it("keeps normal Quality CI pinned to loopback Supabase values", () => {
    const workflow = source(".github/workflows/ci.yml");

    expect(workflow).toContain("Isolate Quality CI from hosted Supabase");
    expect(workflow).toContain("VITE_SUPABASE_URL=http://127.0.0.1:54321");
    expect(workflow).toContain("SUPABASE_URL=http://127.0.0.1:54321");
    expect(workflow).toContain("VITE_CONFIRMATIONS_SUPABASE_URL=http://127.0.0.1:54321");
    expect(workflow).toContain("CONFIRMATIONS_SUPABASE_URL=http://127.0.0.1:54321");
  });

  it("keeps browser CI local even for legacy confirmations clients", () => {
    const workflow = source(".github/workflows/browser-audit.yml");

    expect(workflow).toContain("VITE_CONFIRMATIONS_SUPABASE_URL: http://127.0.0.1:54321");
    expect(workflow).toContain("CONFIRMATIONS_SUPABASE_URL: http://127.0.0.1:54321");
    expect(workflow).toContain('echo "VITE_CONFIRMATIONS_SUPABASE_URL=$local_url"');
    expect(workflow).toContain('echo "CONFIRMATIONS_SUPABASE_URL=$local_url"');
    expect(workflow).toContain('echo "VITE_SUPABASE_PROJECT_ID=local"');
    expect(workflow).toContain('echo "VITE_SUPABASE_PROJECT_REF=local"');
    expect(workflow).toContain('echo "SUPABASE_PROJECT_ID=local"');
    // Supabase CLI uses SUPABASE_PROJECT_REF to select its Docker stack.
    // Exporting "local" after starting the configured disposable project
    // causes the seeder's next 'supabase status' to inspect a nonexistent
    // supabase_db_local container. Preserve the CLI identity, while keeping
    // the application and Worker identities explicitly pinned to local.
    expect(workflow).not.toContain('echo "SUPABASE_PROJECT_REF=local"');
    expect(workflow).toContain("supabase status -o env > /tmp/solaris-browser-supabase.env");
    expect(source(".github/scripts/seed-browser-e2e-local.sh")).toContain('eval "$(supabase status -o env)"');
    expect(workflow).toContain('--var "SUPABASE_PROJECT_REF:local"');
    expect(workflow).toContain("--var \"SUPABASE_PROJECT_ID:local\"");
  });

  it("runs browser regression protection after main changes and makes exhaustive capture explicit", () => {
    const workflow = source(".github/workflows/browser-audit.yml");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("Pull requests and main pushes run the representative smoke set");

    const fullAuditSetting = workflow.split("E2E_FULL_AUDIT:")[1]?.split("\n")[0] ?? "";
    const visualCaptureSetting = workflow.split("E2E_VISUAL_CAPTURE:")[1]?.split("\n")[0] ?? "";
    for (const setting of [fullAuditSetting, visualCaptureSetting]) {
      expect(setting).toContain("github.event_name == 'workflow_dispatch'");
      expect(setting).not.toContain("github.head_ref");
      expect(setting).not.toMatch(/2026\d{4}/);
    }
  });

  it("keeps the client bundle budget as a blocking Quality gate", () => {
    const workflow = source(".github/workflows/ci.yml");

    expect(workflow).toContain("- name: Enforce client performance budget");
    expect(workflow).toContain("run: bun run budget:client");
  });
});
