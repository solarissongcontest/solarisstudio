import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflowFiles = () => {
  const workflowDir = resolve(process.cwd(), ".github/workflows");
  return readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name));
};

/**
 * A local-only browser audit has no reason to receive repository or organization
 * credentials/configuration. The old named-secret check missed innocuous-looking
 * aliases such as secrets.PROD_API_KEY or vars.FRONTEND_URL, including values
 * referenced indirectly within GitHub Actions expressions.
 *
 * Parse complete expression bodies, not just a secret-name prefix.
 * This guard never resolves or prints secret values.
 */
const externalConfigurationExpressions = (content: string): string[] =>
  [...content.matchAll(/\$\{\{([\s\S]*?)\}\}/g)]
    .map((match) => match[1])
    .filter((expression) => /\b(?:secrets|vars)\b/i.test(expression));

const executesBrowserOrDisposableSupabase = (content: string): boolean =>
  /\bplaywright\b|\bsupabase\s+start\b/i.test(content);

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
      expect(content, name).toContain("http://127.0.0.1:54321");
      expect(content, name).toContain("Refusing audit server with hosted Supabase URL");
      expect(content, name).not.toContain("secrets.E2E_SUPABASE_URL");
      expect(content, name).not.toContain("secrets.E2E_SUPABASE_PUBLISHABLE_KEY");
      expect(content, name).not.toMatch(/https:\/\/[^\s"']+\.supabase\.co/i);
    }
  });

  it("keeps browser and disposable-Supabase verification workflows free of GitHub secrets and remote config", () => {
    const isolatedWorkflows = workflowFiles()
      .map((name) => ({ name, content: source(`.github/workflows/${name}`) }))
      .filter(({ content }) => executesBrowserOrDisposableSupabase(content));

    expect(isolatedWorkflows.length).toBeGreaterThan(0);
    for (const { name, content } of isolatedWorkflows) {
      expect(
        externalConfigurationExpressions(content),
        `${name} must never inject GitHub secrets or org/repo vars into local automated verification`,
      ).toEqual([]);
    }
  });

  it("detects aliased and indirect credentials without rejecting local-only expressions", () => {
    const rejected = [
      "env: { API_KEY: ${{ secrets.PROD_API_KEY }} }",
      "env: { URL: ${{ vars.PUBLIC_SITE_ORIGIN }} }",
      "env: { API_KEY: ${{ secrets['NOT_NAMED_SUPABASE'] }} }",
      "env: { KEY: ${{ format('{0}', secrets.BROWSER_TOKEN) }} }",
      "env: { DATA: ${{ toJSON(secrets) }} }",
      "env: { URL: ${{ github.event_name == 'push' && vars.E2E_TARGET || 'http://127.0.0.1:54321' }} }",
    ];
    for (const sourceText of rejected) {
      expect(externalConfigurationExpressions(sourceText), sourceText).toHaveLength(1);
    }
    const accepted = [
      "env: { URL: http://127.0.0.1:54321 }",
      "env: { URL: ${{ env.LOCAL_SUPABASE_URL }} }",
      "if: ${{ github.event_name == 'workflow_dispatch' }}",
      "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
    ];
    for (const sourceText of accepted) {
      expect(externalConfigurationExpressions(sourceText), sourceText).toEqual([]);
    }
    expect(executesBrowserOrDisposableSupabase("run: bunx playwright test")).toBe(true);
    expect(executesBrowserOrDisposableSupabase("run: supabase start")).toBe(true);
    expect(executesBrowserOrDisposableSupabase("run: supabase db reset --local")).toBe(false);
    expect(executesBrowserOrDisposableSupabase("with: { token: ${{ secrets.GITHUB_TOKEN }} }")).toBe(false);
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
