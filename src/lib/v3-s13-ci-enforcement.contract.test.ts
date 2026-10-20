import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s13-migration-adoption.yml"),
  "utf8",
);
const auditScript = readFileSync(
  resolve(process.cwd(), "scripts/check-v3-s13-migration-adoption.ts"),
  "utf8",
);

const enforcementCommand =
  "bun run scripts/check-v3-s13-migration-adoption.ts --require-clean";

describe("System V3 S13 CI enforcement", () => {
  it("hard-gates S13 migration adoption on pull requests and main pushes", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain("- name: Enforce S13 migration adoption");
    expect(workflow.match(new RegExp(enforcementCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(1);
  });

  it("checks out the exact source before running the static gate", () => {
    expect(workflow).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
  });

  it("keeps require-clean fail-closed in the adoption script", () => {
    expect(auditScript).toContain('process.argv.includes("--require-clean")');
    expect(auditScript).toContain("if (requireClean && !report.clean) process.exit(1)");
    expect(auditScript).toContain("V3_S13_REVIEWED_MIGRATION_EXEMPTIONS");
  });
});
