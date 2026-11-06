import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SOLARIS_FEATURE_FLAGS } from "./feature-flags";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const STATIC_CHECK = /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/i;

// A second legitimate migration strategy is to preserve the *actual*
// database constraint and append a single key. This is necessary when multiple
// feature teams ship migrations in parallel. Do not accept an unrecognized
// replacement of a previously validated flag allowlist.
const ADDITIVE_CHECK = /pg_catalog\.format\(\s*'alter table public\.studio2_feature_flags add constraint studio2_feature_flags_key_check check \(\(%s\) or key = %L\)',\s*v_predicate,\s*'([^']+)'\s*\)/gi;

type ConstraintEvolution = {
  staticMigration: string;
  latestMigration: string;
  keys: string[];
  extensions: string[];
};

function effectiveFeatureFlagVocabulary(): ConstraintEvolution {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      source: readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"),
    }));

  let staticMigration = "";
  let latestMigration = "";
  let persisted: Set<string> | null = null;
  const extensions: string[] = [];

  for (const { name, source } of migrations) {
    const staticCheck = source.match(STATIC_CHECK);
    if (staticCheck) {
      const keys = [...staticCheck[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
      if (!keys.length || new Set(keys).size !== keys.length) {
        throw new Error(`${name} has an empty or duplicate persisted feature flag allowlist`);
      }
      persisted = new Set(keys);
      staticMigration = name;
      latestMigration = name;
      continue;
    }

    if (!persisted) continue; // The initial CREATE TABLE constraint predates ALTER TABLE migrations.

    // Only constraint rewrites need validation. A migration that merely
    // selects/references the flag table must not reset the allowlist.
    if (!/alter table public\.studio2_feature_flags\s+drop constraint/i.test(source)) continue;
    if (!source.includes("studio2_feature_flags_key_check")) continue;

    const additive = [...source.matchAll(ADDITIVE_CHECK)].map((match) => match[1]);
    if (additive.length !== 1 ||
        !source.includes("pg_catalog.pg_get_expr(") ||
        !source.includes("if v_predicate is null then") ||
        !source.includes("pg_catalog.strpos(v_predicate,") ||
        !source.includes("on conflict (key) do nothing")) {
      throw new Error(`${name} rewrites the feature flag constraint without a verified additive contract`);
    }

    // We only recognize the exact additive, idempotent 'prior predicate OR
    // new key' recipe. A future migration using a new recipe must explicitly
    // extend this safety test rather than silently bypassing it.
    persisted.add(additive[0]);
    extensions.push(additive[0]);
    latestMigration = name;
  }

  if (!persisted || !staticMigration) {
    throw new Error("No parsable studio2_feature_flags_key_check migration found");
  }
  return {
    staticMigration,
    latestMigration,
    keys: [...persisted],
    extensions,
  };
}

describe("Studio 2 persisted feature-flag vocabulary", () => {
  it("keeps static and additive database constraints aligned with every canonical application flag", () => {
    const evolution = effectiveFeatureFlagVocabulary();

    expect(evolution.keys.length, evolution.latestMigration).toBeGreaterThan(0);
    expect(new Set(evolution.keys).size, evolution.latestMigration).toBe(evolution.keys.length);

    for (const key of SOLARIS_FEATURE_FLAGS) {
      expect(
        evolution.keys,
        `${evolution.latestMigration} drops canonical feature flag ${key}; concurrent rollout migrations must preserve the full vocabulary`,
      ).toContain(key);
    }
  });

  it("handles the Terra World flag as an additive migration, not a stale full-list reset", () => {
    const evolution = effectiveFeatureFlagVocabulary();
    expect(evolution.keys).toContain("terra_world_public");
    expect(evolution.extensions).toContain("terra_world_public");
  });
});
