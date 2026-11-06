import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SOLARIS_FEATURE_FLAGS } from "./feature-flags";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const CONSTRAINT_MARKER = "add constraint studio2_feature_flags_key_check check";

function latestFeatureFlagConstraintMigration() {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      source: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"),
    }))
    .filter(({ source }) => source.toLowerCase().includes(CONSTRAINT_MARKER));

  const latest = migrations.at(-1);
  if (!latest) {
    throw new Error("No studio2_feature_flags_key_check migration found");
  }
  return latest;
}

function constrainedFlagKeys(source: string) {
  const constraint = source.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/i,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("Studio 2 persisted feature-flag vocabulary", () => {
  it("keeps the latest database constraint aligned with every canonical application flag", () => {
    const latest = latestFeatureFlagConstraintMigration();
    const persisted = constrainedFlagKeys(latest.source);

    expect(persisted.length, `${latest.name} did not expose a parsable feature-flag constraint`).toBeGreaterThan(0);
    expect(new Set(persisted).size, `${latest.name} contains duplicate feature-flag keys`).toBe(
      persisted.length,
    );

    for (const key of SOLARIS_FEATURE_FLAGS) {
      expect(
        persisted,
        `${latest.name} drops canonical feature flag ${key}; concurrent rollout migrations must preserve the full vocabulary`,
      ).toContain(key);
    }
  });
});
