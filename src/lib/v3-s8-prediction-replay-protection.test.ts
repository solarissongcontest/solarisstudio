import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s8-prediction-replay-protection-rehearsal.sh",
);
const workflow = source(
  ".github/workflows/v3-s8-prediction-replay-protection-rehearsal.yml",
);

describe("System V3 S8 Prediction replay protection", () => {
  it("derives the maximum request cardinality from authoritative round configuration", () => {
    expect(migration).toContain("max_item_count :=");
    expect(migration).toContain("'winner' = any(round_row.prediction_types)");
    expect(migration).toContain("least(10, participant_count)");
    expect(migration).toContain("participant_count else 0 end");
    expect(migration).toContain("greatest(coalesce(qualifier_count, 0), 0)");
    expect(migration).toContain("jsonb_array_length(_payload) > max_item_count");
    expect(migration).toContain("configured round item budget");
  });

  it("rejects fields outside the canonical PredictionItem contract", () => {
    expect(migration).toContain("item - array['countryId','type','rank','confidence']::text[]");
    expect(migration).toContain("unavailable type, country or field");
    expect(rehearsal).toContain("prediction unsupported item field");
  });

  it("canonicalizes array order before deciding whether a retry is identical", () => {
    expect(migration).toContain("private.v3_prediction_payload_canonical");
    expect(migration).toContain("order by");
    expect(migration).toContain("private.v3_prediction_payload_canonical(previous_payload)");
    expect(migration).toContain("= private.v3_prediction_payload_canonical(_payload)");
    expect(rehearsal).toContain("Array order is not semantic identity");
  });

  it("returns before version and item mutation for semantic retries", () => {
    const replayCheck = migration.indexOf("private.v3_prediction_payload_canonical(previous_payload)");
    const versionIncrement = migration.indexOf("next_version := entry_row.version + 1");
    const itemDelete = migration.indexOf("delete from public.prediction_items");
    expect(replayCheck).toBeGreaterThan(0);
    expect(versionIncrement).toBeGreaterThan(replayCheck);
    expect(itemDelete).toBeGreaterThan(replayCheck);
    expect(rehearsal).toContain("Exact retry does not amplify version history");
    expect(rehearsal).toContain("Concurrent identical retries do not amplify versions");
  });

  it("preserves changed semantic submissions as a new immutable version", () => {
    expect(migration).toContain("next_version := entry_row.version + 1");
    expect(migration).toContain("insert into public.prediction_entry_versions");
    expect(rehearsal).toContain("Changed semantics create exactly one new version");
  });

  it("keeps the canonicalization helper private", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_prediction_payload_canonical(jsonb)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(rehearsal).toContain("Canonical helper remains private");
  });

  it("uses only isolated local Supabase for automated database verification", () => {
    expect(rehearsal).toContain('http://127.0.0.1:*|http://localhost:*');
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toContain("supabase.co");
  });
});
