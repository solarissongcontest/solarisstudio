import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflowFiles = () => {
  const workflowDir = resolve(process.cwd(), ".github/workflows");
  return readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name));
};

const S14_STATEFUL_WORKFLOW = "v3-s14-full-contest-rehearsal.yml";

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
      .filter(({ content }) => /playwright/i.test(content));

    expect(playwrightWorkflows.length).toBeGreaterThan(0);

    for (const { name, content } of playwrightWorkflows) {
      expect(content, name).toContain("supabase start");
      expect(content, name).not.toContain("secrets.E2E_SUPABASE_URL");
      expect(content, name).not.toContain("secrets.E2E_SUPABASE_PUBLISHABLE_KEY");
      expect(content, name).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);

      // The stateful S14 rehearsal discovers the freshly started local Supabase
      // port at runtime and has its own explicit fail-closed contract below.
      // Every other Playwright workflow keeps the established fixed-loopback
      // browser-audit contract. A new workflow therefore fails this test until
      // its production-isolation design is deliberately reviewed and covered.
      if (name === S14_STATEFUL_WORKFLOW) continue;

      expect(content, name).toContain("http://127.0.0.1:54321");
      expect(content, name).toContain("Refusing audit server with hosted Supabase URL");
    }
  });

  it("keeps the S14 stateful Playwright rehearsal on runtime-discovered loopback Supabase", () => {
    const workflow = source(`.github/workflows/${S14_STATEFUL_WORKFLOW}`);

    expect(workflow).toContain('eval "$(supabase status -o env)"');
    expect(workflow).toContain('http://127.0.0.1:*|http://localhost:*');
    expect(workflow).toContain("Refusing S14 against non-local Supabase API_URL=$API_URL");
    expect(workflow).toContain('export VITE_SUPABASE_URL="$API_URL"');
    expect(workflow).toContain('export SUPABASE_URL="$API_URL"');
    expect(workflow).toContain('export E2E_SUPABASE_URL="$API_URL"');
    expect(workflow).toContain('export VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"');
    expect(workflow).toContain('export CONFIRMATIONS_SUPABASE_URL="$API_URL"');
    expect(workflow).toContain("bun run scripts/check-v3-production-isolation.ts");

    const qualifierRuntime = source("e2e/v3-s14-grand-final-runtime.e2e.ts");
    const resultsRuntime = source("e2e/v3-s14-grand-final-results-runtime.e2e.ts");
    expect(qualifierRuntime).toContain("S14 grand-final browser refuses non-local Supabase URL");
    expect(resultsRuntime).toContain("S14 Grand Final Results refuses non-local Supabase URL");
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
  });

  it("runs browser regression protection after main changes and keeps the recovery branch exhaustive", () => {
    const workflow = source(".github/workflows/browser-audit.yml");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("as do main pushes");
    const fullAuditSetting = workflow.split("E2E_FULL_AUDIT:")[1]?.split("\n")[0];
    expect(fullAuditSetting).not.toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.head_ref == 'recovery/canonical-main-v6-20261004'");
  });

  it("keeps the client bundle budget as a blocking Quality gate", () => {
    const workflow = source(".github/workflows/ci.yml");

    expect(workflow).toContain("- name: Enforce client performance budget");
    expect(workflow).toContain("run: bun run budget:client");
  });
});
