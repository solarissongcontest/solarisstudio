import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261004225000_lock_legacy_televoting_tables.sql",
  ),
  "utf8",
);

describe("legacy Televoting staging table lockdown", () => {
  it("removes browser CRUD and enables RLS on both legacy tables", () => {
    for (const table of [
      "televoting.legacy_friend_voting_relationships",
      "televoting.legacy_import_metadata",
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(
        `revoke all on ${table} from public, anon, authenticated`,
      );
    }
  });
});
