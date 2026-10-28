import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("tests candidate runtime against the upgraded main database without replaying old main behavior", () => {
  const workflow = readFileSync(".github/workflows/v3-integrity-authority-chat5.yml", "utf8");
  const upgrade = workflow.slice(workflow.indexOf("  upgrade-from-main:"));
  expect(upgrade).toContain("git worktree add /tmp/solaris-integrity-main origin/main");
  expect(upgrade).toContain("supabase migration up --local --include-all");
  const runtime = upgrade.slice(upgrade.indexOf("      - name: Run hostile Rules + Integrity rehearsal after upgrade"), upgrade.indexOf("      - name: Stop isolated Supabase"));
  expect(runtime).toContain('cd "$GITHUB_WORKSPACE"');
  expect(runtime).not.toContain("cd /tmp/solaris-integrity-main");
  expect(runtime).toContain("bash .github/scripts/run-rules-integrity-security-rehearsal.sh");
  const wrapper = readFileSync(".github/scripts/run-rules-integrity-security-rehearsal.sh", "utf8");
  expect(wrapper).toContain('${BASH_SOURCE[0]}');
  expect(wrapper).toContain('bash "$script_dir/rules-integrity-security-rehearsal.sh"');
});
