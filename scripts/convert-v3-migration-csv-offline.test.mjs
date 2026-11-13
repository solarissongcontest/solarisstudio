import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseMigrationHistoryCsv } from "./convert-v3-migration-csv-offline.mjs";

const temp = [];
afterEach(() => {
  for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), "solaris-migration-csv-offline-"));
  temp.push(dir);
  const input = join(dir, "history.csv"), output = join(dir, "history.json");
  const run = (...args) => spawnSync(
    "node",
    ["scripts/convert-v3-migration-csv-offline.mjs", "--input", input, "--output", output, ...args],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  return { dir, input, output, run };
};

describe("isolated CSV-to-JSON frontier conversion", () => {
  it("preserves every migration version/name, index-free CRLF and raw byte SHA-256", () => {
    const f = fixture();
    const text = "version,name\r\n20261001202836,bootstrap_first\r\n20261101181812,v3_s13_adopt_rules\r\n";
    writeFileSync(f.input, text);
    const result = f.run("--expected-rows", "2", "--expected-tip", "20261101181812");
    expect(result.status).toBe(0);
    const data = JSON.parse(readFileSync(f.output, "utf8"));
    expect(data).toEqual({ migrations: [
      { version: "20261001202836", name: "bootstrap_first" },
      { version: "20261101181812", name: "v3_s13_adopt_rules" },
    ] });
    const summary = JSON.parse(result.stdout);
    expect(summary).toMatchObject({
      rows: 2, latestVersion: "20261101181812",
      projectIdentityVerified: false, hostedSqlEffectsVerified: false,
      productionDeploymentAuthorized: false,
    });
    expect(summary.csvSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts the optional actual export index only when exactly sequential", () => {
    const csv = "index,version,name\n0,20261001202836,\"bootstrap,first\"\n1,20261101181812,\"last\"\"migration\"\n";
    expect(parseMigrationHistoryCsv(csv)).toEqual([
      { version: "20261001202836", name: "bootstrap,first" },
      { version: "20261101181812", name: 'last"migration' },
    ]);
    expect(() => parseMigrationHistoryCsv(csv.replace("1,2026", "3,2026")))
      .toThrow(/Invalid export index/);
  });

  it("rejects duplicate, descending, malformed and missing-name evidence", () => {
    const base = "version,name\n20261001202836,first\n";
    expect(() => parseMigrationHistoryCsv(base + "20261001202836,duplicate\n"))
      .toThrow(/Duplicate migration version/);
    expect(() => parseMigrationHistoryCsv(base + "20261001202835,older\n"))
      .toThrow(/not strictly ascending/);
    expect(() => parseMigrationHistoryCsv("version,name\n202610012028,invalid\n"))
      .toThrow(/Invalid migration version/);
    expect(() => parseMigrationHistoryCsv("version,name\n20261001202836,\n"))
      .toThrow(/Missing migration name/);
    expect(() => parseMigrationHistoryCsv("version,name\n20261001202836,\"unfinished"))
      .toThrow(/Unterminated quoted/);
    expect(() => parseMigrationHistoryCsv("version,name\n20261001202836,safe,extra\n"))
      .toThrow(/Malformed CSV row/);
  });

  it("does not write any evidence when a count/tip check fails", () => {
    const f = fixture();
    writeFileSync(f.input, "version,name\n20261101181812,tip\n");
    expect(f.run("--expected-rows", "497").status).toBe(1);
    expect(f.run("--expected-tip", "20261101181813").status).toBe(1);
    expect(() => readFileSync(f.output)).toThrow();
  });

  it("refuses overwrites and repository-local output paths", () => {
    const f = fixture();
    writeFileSync(f.input, "version,name\n20261101181812,tip\n");
    expect(f.run().status).toBe(0);
    expect(f.run().status).toBe(1);
    const content = readFileSync(f.output, "utf8");
    expect(JSON.parse(content).migrations).toHaveLength(1);
    const repoOutput = "scripts/forbidden-history.json";
    const rejected = f.run("--output", repoOutput);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(/Refusing to write migration evidence inside repository/);
  });
});
