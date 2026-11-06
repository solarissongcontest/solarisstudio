import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("TG19 historical GAG provenance preflight passes its offline fail-closed contract", () => {
  const contractPath = resolve(
    process.cwd(),
    "scripts/__tests__/world-gag-import-preflight.test.mjs",
  );
  const result = spawnSync(process.execPath, ["--test", contractPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });

  expect(result.error).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toMatch(/^# fail 0$/m);
});
