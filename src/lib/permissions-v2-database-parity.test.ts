import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SOLARIS_CAPABILITIES } from "./permissions-v2";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

function databaseDeclaredCapabilities() {
  const capabilities = new Set<string>();
  const insertPattern =
    /insert\s+into\s+public\.studio2_capabilities\s*\([^)]*\)\s*values\s*([\s\S]*?)(?:on\s+conflict|;)/gi;
  const tuplePattern = /\(\s*'([^']+)'\s*,/g;

  for (const filename of readdirSync(MIGRATIONS_DIR)) {
    if (!filename.endsWith(".sql")) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, filename), "utf8");

    for (const insert of sql.matchAll(insertPattern)) {
      const values = insert[1] ?? "";
      for (const tuple of values.matchAll(tuplePattern)) {
        const capability = tuple[1];
        if (capability) capabilities.add(capability);
      }
    }
  }

  return capabilities;
}

describe("Permission Engine typed capability registry", () => {
  it("represents every literal capability declared by the migration authority", () => {
    const databaseCapabilities = databaseDeclaredCapabilities();
    const typedCapabilities = new Set<string>(SOLARIS_CAPABILITIES);
    const missing = [...databaseCapabilities]
      .filter((capability) => !typedCapabilities.has(capability))
      .sort();

    expect(databaseCapabilities.has("maintenance.manage")).toBe(true);
    expect(databaseCapabilities.has("next_in_line.manage")).toBe(true);
    expect(missing).toEqual([]);
  });

  it("does not contain duplicate capability names", () => {
    expect(new Set(SOLARIS_CAPABILITIES).size).toBe(SOLARIS_CAPABILITIES.length);
  });
});
