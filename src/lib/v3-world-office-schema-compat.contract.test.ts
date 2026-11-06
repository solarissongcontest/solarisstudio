import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

describe("TG19 World office-term schema-compatibility source guard", () => {
  it("executes the offline Node regression suite during normal Quality", () => {
    const result = spawnSync(
      process.execPath,
      ["--test", "scripts/check-v3-world-office-schema-compat.test.mjs"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: {
          // The scanner and its fixtures use only local files; no remote
          // Supabase, database or GitHub credentials are ever required.
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          TMPDIR: process.env.TMPDIR ?? "/tmp",
        },
      },
    );

    expect(result.error?.message).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, [result.stdout, result.stderr].filter(Boolean).join("\n")).toBe(0);
    expect(result.stdout).toMatch(/# pass 8\b/);
    expect(result.stdout).toMatch(/# fail 0\b/);
  });
});
