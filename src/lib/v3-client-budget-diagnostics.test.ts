import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

const script = resolve("scripts/check-client-bundle-budget.mjs");
function fixture(run: (root: string, assets: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "solaris-budget-"));
  const assets = join(root, "dist/assets");
  mkdirSync(assets, { recursive: true });
  try { run(root, assets); } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("client budget failure diagnostics", () => {
  it("names every oversized chunk and its configured raw limit", () => fixture((root, assets) => {
    for (const name of ["organizer-large.js", "public-large.js"]) {
      writeFileSync(join(assets, name), "x".repeat(1_100 * 1024));
    }
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("1100.0 KiB > 1050.0 KiB (organizer-large.js)");
    expect(result.stderr).toContain("1100.0 KiB > 1050.0 KiB (public-large.js)");
  }));

  it("attributes aggregate-only failures even when individual chunks fit", () => fixture((root, assets) => {
    for (let i = 0; i < 10; i++) writeFileSync(join(assets, `route-${i}.js`), randomBytes(200 * 1024));
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Total JS + CSS gzip:");
    expect(result.stderr).toContain("1800.0 KiB");
    expect(result.stderr).toContain("Largest contributors");
    expect(result.stderr).toContain("route-0.js:");
    expect(result.stderr).not.toContain("JS raw:");
    expect(result.stderr).not.toContain("JS gzip:");
  }));

  it("accepts a small production bundle", () => fixture((root, assets) => {
    writeFileSync(join(assets, "public-small.js"), "export default 1;");
    expect(execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8" })).toContain("Client performance budget passed.");
  }));
});
