import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260812005000_phase_2_prediction_arena_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("prediction migration security contract", () => {
  it("enables RLS for every fan prediction table", () => {
    for (const table of [
      "fan_profiles",
      "prediction_rounds",
      "prediction_entries",
      "prediction_items",
      "prediction_entry_versions",
      "prediction_scores",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("routes fan writes through an authenticated, database-timed function", () => {
    expect(migration).toContain("create or replace function public.submit_prediction");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("current_user_id uuid := auth.uid()");
    expect(migration).toContain("or now() >= round_row.locks_at");
    expect(migration).toContain("grant select on public.prediction_entries to authenticated;");
    expect(migration).not.toContain(
      "grant select, insert, update, delete on public.prediction_entries to authenticated;",
    );
  });

  it("keeps revisions immutable and consensus aggregate-only", () => {
    expect(migration).toContain("insert into public.prediction_entry_versions");
    expect(migration).not.toContain("prediction_entry_versions for update");
    expect(migration).not.toContain("prediction_entry_versions for delete");
    expect(migration).toContain("sample_size < round_row.consensus_minimum");
    expect(migration).toContain("Submit a prediction before viewing consensus");
    expect(migration).not.toContain("grant select on public.fan_profiles to anon");
  });
});
