import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_NON_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_ALLOWLIST,
  V3_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_DEBT,
} from "./v3-public-results-base-table-debt";

const SRC_ROOT = resolve(process.cwd(), "src");
const DIRECT_RESULTS_READ = /\.from\s*\(\s*["']results["']\s*\)/;

function repositoryPath(path: string) {
  return `src/${relative(SRC_ROOT, path).split(sep).join("/")}`;
}

function runtimeSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(path);
    if (!/\.(?:ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

function directResultReaders() {
  return runtimeSourceFiles(SRC_ROOT)
    .filter((path) => DIRECT_RESULTS_READ.test(readFileSync(path, "utf8")))
    .map(repositoryPath)
    .sort();
}

describe("V3 public.results base-table retirement guard", () => {
  it("allows only the explicitly registered remaining direct readers", () => {
    const publicDebt = V3_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_DEBT.map(
      ({ path }) => path,
    );
    const expected = [
      ...publicDebt,
      ...V3_NON_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_ALLOWLIST,
    ].sort();

    expect(directResultReaders()).toEqual(expected);
  });

  it("keeps Public debt isolated to server adapters with one replacement authority", () => {
    for (const debt of V3_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_DEBT) {
      expect(debt.path).toMatch(/^src\/integrations\/v3\/.*\.server\.ts$/);
      expect(debt.replacementAuthority).toBe(
        "v3_public_published_result_snapshot",
      );
    }
  });

  it("does not disguise Public debt as an Organizer or System exception", () => {
    const publicDebt = new Set<string>(
      V3_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_DEBT.map(({ path }) => path),
    );

    for (const path of V3_NON_PUBLIC_RESULTS_BASE_TABLE_DIRECT_READ_ALLOWLIST) {
      expect(publicDebt.has(path)).toBe(false);
    }
  });
});
