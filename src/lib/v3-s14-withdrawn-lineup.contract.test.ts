import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertS14TelevoteReadback } from "../../scripts/lib/s14-televote-readback";

const stage7 = readFileSync(".github/scripts/v3-s14-stage-7-public-voting.sh", "utf8");
const adapter = readFileSync("scripts/v3-s14-materialize-televote-results.ts", "utf8");

describe("S14 canonical lineup after Stage-4 withdrawal", () => {
  it("filters both round-country and round-entry fixtures by current confirmed participation", () => {
    const fixtures = stage7.slice(stage7.indexOf("insert into televoting.round_countries"), stage7.indexOf("insert into public.televoting_round_bindings"));
    expect(fixtures.match(/coalesce\(p\.participation_status,'confirmed'\)='confirmed'/g)).toHaveLength(4);
    expect(stage7).toContain('"$expected_participants"');
    expect(stage7).not.toContain('does not contain exactly 33 entries');
  });

  it("checks lineup identity before replacing derived result evidence", () => {
    expect(adapter.indexOf("Televote lineup does not exactly match confirmed show")).toBeLessThan(adapter.indexOf('from("round_results").delete()'));
    expect(adapter).not.toContain('from("televote_votes").insert');
    expect(adapter).toContain("assertS14TelevoteReadback(expectedVotes, canonicalVotes ?? [])");
  });

  const expected = [{ country_id: "confirmed-a", points: 12 }, { country_id: "confirmed-b", points: 8 }];
  it("accepts canonical publication in a different row order", () => {
    expect(assertS14TelevoteReadback(expected, [...expected].reverse())).toBe(2);
  });
  it.each([
    [...expected, { country_id: "withdrawn", points: 0 }],
    [expected[0]],
    [expected[0], expected[0]],
    [expected[0], { country_id: "confirmed-b", points: 7 }],
    [expected[0], { country_id: "wrong-country", points: 8 }],
  ].map((actual) => ({ actual })))("rejects stale, incomplete, duplicated or changed canonical totals", ({ actual }) => {
    expect(() => assertS14TelevoteReadback(expected, actual)).toThrow("canonical publication readback differs");
  });
});
