import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TG19 institutional ballot event confidentiality", () => {
  it("executes the committed offline SQL privacy regression suite in Quality", () => {
    const fixtureSuite = resolve(process.cwd(), "scripts/check-v3-world-ballot-event-privacy.test.mjs");
    const execution = spawnSync(process.execPath, ["--test", fixtureSuite], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { NODE_ENV: "test" },
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });

    const evidence = [execution.stdout, execution.stderr].filter(Boolean).join("\n");
    expect(execution.error, evidence).toBeUndefined();
    expect(execution.status, evidence).toBe(0);
    expect(execution.stdout).toMatch(/# pass\s+8\b/);
  }, 25_000);
});
