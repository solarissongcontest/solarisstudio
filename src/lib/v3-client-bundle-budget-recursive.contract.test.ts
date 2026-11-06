import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("V3 fixed client bundle budget nested-asset regression", () => {
  it("executes the pure Node nested-asset fixtures in Quality CI", () => {
    const result = spawnSync(
      "node",
      ["--test", "scripts/check-client-bundle-budget.recursive.test.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30_000,
        env: { ...process.env, GITHUB_ACTIONS: "" },
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status, [result.stdout, result.stderr].join("\n")).toBe(0);
    expect(result.stdout).toContain("tests 5");
    expect(result.stdout).toContain("fail 0");
  });
});
