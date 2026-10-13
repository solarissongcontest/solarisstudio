import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!/\.(?:ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

describe("V3 browser audit hydration coverage", () => {
  it("waits for every production V3 boot marker before interaction auditing", () => {
    const audit = source("e2e/audit-helpers.ts");
    const markers = new Set<string>();

    for (const file of productionSourceFiles(resolve(ROOT, "src"))) {
      const contents = readFileSync(file, "utf8");
      for (const match of contents.matchAll(/data-v3-[a-z0-9-]*boot/g)) {
        markers.add(match[0]);
      }
    }

    expect(markers.size).toBeGreaterThanOrEqual(7);
    for (const marker of markers) {
      expect(audit, `Browser Audit must wait for ${marker}`).toContain(`"[${marker}]"`);
    }
    expect(audit).toContain("page.locator(V3_BOOT_SELECTOR)");
    expect(audit).toContain("finish every V3 hydration gate before interaction auditing");
    expect(audit).not.toContain('page.locator("[data-v3-primary-boot]")');
  });
});
