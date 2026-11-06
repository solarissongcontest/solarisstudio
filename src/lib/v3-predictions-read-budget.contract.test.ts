import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/prediction-data.ts"), "utf8");

describe("V3 Predictions read budget", () => {
  it("keeps prediction and fan projections explicit instead of wildcard reads", () => {
    expect(source).toContain("const FAN_PROFILE_FIELDS");
    expect(source).toContain("const PREDICTION_ROUND_FIELDS");
    expect(source).toContain("const PREDICTION_ENTRY_FIELDS");
    expect(source).toContain("const PREDICTION_SCORE_FIELDS");
    expect(source).not.toContain('.select("*")');
  });

  it("loads score details with only the fields used by PredictionScoreRow", () => {
    expect(source).toContain('"entry_id,score,percentile,breakdown,scoring_version,scored_at"');
    expect(source).toContain('.from("prediction_scores")');
    expect(source).toContain(".select(PREDICTION_SCORE_FIELDS)");
  });

  it("keeps history and current-entry reads on the same bounded row projection", () => {
    expect(source.match(/\.select\(PREDICTION_ENTRY_FIELDS\)/g)?.length).toBe(2);
    expect(source).toContain('"id,round_id,profile_id,version,state,submitted_at,locked_at,share_token,created_at,updated_at"');
  });

  it("does not re-expand fan profile payloads on readback after save", () => {
    expect(source.match(/\.select\(FAN_PROFILE_FIELDS\)/g)?.length).toBe(2);
    expect(source).toContain('"id,display_name,visibility,leaderboard_opt_in,created_at,updated_at"');
  });

  it("keeps round projections complete without future-schema payload creep", () => {
    expect(source).toContain(".select(PREDICTION_ROUND_FIELDS)");
    expect(source).toContain(
      '"id,show_id,opens_at,locks_at,status,prediction_types,scoring_version,consensus_minimum,created_at,updated_at"',
    );
  });
});
