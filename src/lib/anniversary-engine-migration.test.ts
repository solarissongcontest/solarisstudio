import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260916172823_anniversary_engine_canonical_participations.sql",
  ),
  "utf8",
);

describe("anniversary engine canonical participation migration", () => {
  it("does not require legacy editions to have a show_id-null participant row", () => {
    expect(migration).toContain("create or replace function public.studio2_anniversary_engine");
    expect(migration).toContain("select p.country_id, min(e.event_date) as first_date");
    expect(migration).not.toContain("p.show_id is null");
  });

  it("keeps the public anniversary engine stable and transaction-wrapped", () => {
    expect(migration.trim().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trim().toLowerCase().endsWith("commit;")).toBe(true);
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
  });
});
