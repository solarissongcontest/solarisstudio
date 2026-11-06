import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TG19 release guard: execute the real offline SQL-source scanner over this
 * checkout's complete migration inventory in the existing Quality test run.
 * No Supabase client, network request, database migration or hosted URL is used.
 */
describe("Terra Solaris World dark-launch source inventory", () => {
  it("preserves the canonical disabled rollout and refuses unreviewed flag mutation", () => {
    const command = resolve(process.cwd(), "scripts/check-world-dark-launch-contract.mjs");
    const run = spawnSync(process.execPath, [command, "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
      // Keep production/runtime secrets out of the child process entirely.
      env: { PATH: process.env.PATH ?? "", LANG: "C.UTF-8" },
    });

    if (run.error) throw run.error;
    expect(run.status, run.stderr || "World source preflight failed").toBe(0);

    const report = JSON.parse(run.stdout) as {
      clean: boolean;
      flag: string;
      canonicalRegistrationCount: number;
      filesChecked: number;
      findings: unknown[];
    };
    expect(report.clean).toBe(true);
    expect(report.flag).toBe("terra_world_public");
    expect(report.canonicalRegistrationCount).toBe(1);
    expect(report.filesChecked).toBeGreaterThan(0);
    expect(report.findings).toEqual([]);
  });
});
