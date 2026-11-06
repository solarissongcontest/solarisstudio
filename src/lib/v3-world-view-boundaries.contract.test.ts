import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Keep the TG19 view/privacy audit's offline fixture suite on the normal
 * Quality/Vitest path. Its fixtures stub psql; this never opens a DB socket.
 * A separate disposable local-Postgres rehearsal is still required for S16.
 */
test("World view boundary audit runs all offline security regressions in Quality", () => {
  const env = { ...process.env };
  delete env.WORLD_LOCAL_DATABASE_URL;
  for (const key of Object.keys(env)) {
    if (/^PG[A-Z_]/.test(key)) delete env[key];
  }

  const child = spawnSync(process.execPath, [
    "--test", resolve(process.cwd(), "scripts/audit-v3-world-view-boundaries.test.mjs"),
  ], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });

  expect(child.error).toBeUndefined();
  expect(child.status, child.stdout || child.stderr).toBe(0);
  expect(child.stdout).toMatch(/# tests [1-9]\d*/);
  expect(child.stdout).toMatch(/# fail 0/);
});
