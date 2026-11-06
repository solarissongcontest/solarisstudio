import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/organizer-prediction-data.ts", "utf8");

describe("Organizer Prediction round read egress boundary", () => {
  it("uses an explicit complete current round projection rather than schema-wide reads", () => {
    expect(source).not.toContain('.select("*")');
    expect(source).toContain(
      '"id, show_id, opens_at, locks_at, status, prediction_types, scoring_version, consensus_minimum, created_at, updated_at"',
    );
    expect(source).toContain(".select(ORGANIZER_PREDICTION_ROUND_PROJECTION)");
  });

  it("preserves exact selected-edition show scoping and deterministic ordering", () => {
    expect(source).toContain("normalizedShowIds.length > 0");
    expect(source).toContain('.in("show_id", normalizedShowIds)');
    expect(source).toContain('.order("locks_at", { ascending: true })');
    expect(source).toContain('["prediction-rounds", "organizer-shows", normalizedShowIds, includeCancelled]');
  });

  it("preserves the cancelled-round policy without introducing polling or realtime fan-out", () => {
    expect(source).toContain('query.neq("status", "cancelled")');
    expect(source).toContain("staleTime: 30_000");
    expect(source).not.toContain("refetchInterval");
    expect(source).not.toContain(".channel(");
  });
});
