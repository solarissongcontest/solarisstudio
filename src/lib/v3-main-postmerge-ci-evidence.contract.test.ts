import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("V3 post-merge main CI evidence", () => {
  it("fails closed on stale SHA, cancellations, incomplete checks and PR-only green evidence", () => {
    const result = spawnSync(
      process.execPath,
      ["--test", "scripts/verify-v3-main-ci-evidence.test.mjs"],
      { encoding: "utf8", timeout: 15_000 },
    );
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("uses a manual read-only exact-main verifier rather than testing production", () => {
    const workflow = readFileSync(
      ".github/workflows/v3-main-postmerge-ci-evidence.yml",
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("node scripts/verify-v3-main-ci-evidence.mjs");
    expect(workflow).toContain("if: always()");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("supabase start");
    expect(workflow).not.toContain("bun run build");
  });
});
