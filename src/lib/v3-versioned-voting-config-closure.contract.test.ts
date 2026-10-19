import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const closure = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019231600_v3_voting_config_preflight_risk_closure.sql"),
  "utf8",
);

describe("V3 VotingConfig compatibility closure", () => {
  it("validates the public-vote round structure used by downstream scoring", () => {
    expect(closure).toContain("private.v3_assert_voting_config_televote_round_shape(");
    expect(closure).toContain("jsonb_array_length(p_config -> 'televoteRounds') > 2");
    expect(closure).toContain("v_weight < 0 or v_weight > 100");
    expect(closure).toContain("abs(v_weight_sum - 100) > 0.0001");
    expect(closure).toContain("v_id = any(v_ids)");
    expect(closure).toContain("private.v3_assert_voting_config_televote_round_shape(p_proposed_config)");
  });

  it("keeps legacy qualifier_count synchronized with explicit config truth", () => {
    expect(closure).toContain("new.voting_config, '{}'::jsonb) ? 'qualifiers'");
    expect(closure).toContain("new.qualifier_count := (new.voting_config ->> 'qualifiers')::integer");
    expect(closure).toContain("new.qualifier_count := null");
  });

  it("keeps direct legacy writes behind the same validation and evidence freeze", () => {
    expect(closure).toContain("create or replace function private.v3_guard_voting_config_write()");
    expect(closure).toContain("private.v3_assert_voting_config_shape(coalesce(new.voting_config, '{}'::jsonb))");
    expect(closure).toContain("private.v3_assert_voting_config_televote_round_shape(coalesce(new.voting_config, '{}'::jsonb))");
    expect(closure).toContain("private.v3_assert_voting_config_change_allowed(new.edition_id, new.id)");
  });

  it("keeps allowed changed configs R2 while evidence-bearing changes remain blocked", () => {
    expect(closure).toContain("when v_blocked then 'blocked'");
    expect(closure).toContain("else 'R2'");
    expect(closure).not.toContain("then 'R3'");
  });
});
