import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("V3 old-to-current Storage recovery local-only regression", () => {
  it("passes all isolated Node Storage/authorization failure-mode tests without hosted credentials", () => {
    // This test runner only invokes the pure fake-Storage suite, never the
    // manual CLI or real Supabase clients. Do not forward CI secrets to it.
    const output = execFileSync(
      "node",
      ["--test", resolve(process.cwd(), "scripts/lib/v3-media-recovery-core.test.mjs")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          CI: "true",
          NODE_ENV: "test",
          PATH: process.env.PATH,
        },
      },
    );
    expect(output).toMatch(/# fail 0(?:\r?\n|$)/);
    expect(output).toMatch(/# pass [1-9]\d*(?:\r?\n|$)/);
  });
});
