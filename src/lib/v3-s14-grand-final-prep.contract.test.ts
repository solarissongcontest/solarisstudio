import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const finalLeg = readFileSync(".github/scripts/v3-s14-grand-final-leg.sh", "utf8");
const qualification = readFileSync(
  "supabase/migrations/20260822212800_result_rank_is_qualification_source.sql",
  "utf8",
);
const lineup = readFileSync("src/components/admin/ShowLineupWorkspace.tsx", "utf8");

describe("S14 canonical qualifier-to-final preparation", () => {
  it("requires real result-ranked qualification before creating final appearances", () => {
    expect(finalLeg).toContain("exactly 20 canonical semi-final qualifiers");
    expect(finalLeg).toContain("ten canonical qualifiers from each semi-final");
    expect(finalLeg).toContain("r.final_rank between 1 and 10");
    expect(finalLeg).toContain("p.qualified is true");
    expect(qualification).toContain("final_rank between 1 and cutoff");
    expect(qualification).toContain("set qualified = o.qualified");
  });

  it("creates only new final show appearances instead of inventing new delegation truth", () => {
    expect(finalLeg).toContain("select distinct on (p.country_id)");
    expect(finalLeg).toContain("p.country_id,p.contest_entity_id,p.artist,p.song");
    expect(finalLeg).toContain("grand final contains a country without canonical qualified truth");
    expect(lineup).toContain("participant.qualified");
    expect(lineup).toContain("addQualifiers");
  });

  it("uses the same atomic running-order primitives already exercised in Stage 5", () => {
    expect(finalLeg).toContain("admin_set_show_allocations");
    expect(finalLeg).toContain("admin_set_show_running_order");
    expect(finalLeg).toContain("grand-final running order is not contiguous 1..20");
  });

  it("prepares explicit canonical Jury and Televote sources for the final", () => {
    expect(finalLeg).toContain("grand-final Jury roster does not contain all 66 delegations");
    expect(finalLeg).toContain("S14_FINAL_TELEVOTE_ROUND_ID");
    expect(finalLeg).toContain("televoting_round_bindings");
    expect(finalLeg).toContain("grand-final Televote round does not contain exactly 20 finalists");
    expect(finalLeg).toContain("source_mode='show'");
  });

  it("is prepared but does not falsely execute before upstream result truth exists", () => {
    const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-grand-final-leg.sh"');
    expect(driver).not.toContain("prepare_s14_grand_final_from_qualifiers");
    expect(finalLeg).toContain("S14_GRAND_FINAL_PREPARED_FROM_CANONICAL_QUALIFIERS");
  });

  it("keeps the grand-final shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-grand-final-leg.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
