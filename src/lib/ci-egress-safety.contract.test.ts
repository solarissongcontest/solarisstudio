import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("CI egress safety contracts", () => {
  it("keeps every Playwright workflow isolated from hosted Supabase", () => {
    const workflowDir = resolve(process.cwd(), ".github/workflows");
    const workflowFiles = readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name));
    const playwrightWorkflows = workflowFiles
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
});
