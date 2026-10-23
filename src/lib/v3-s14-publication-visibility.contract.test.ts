import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stage5 = readFileSync(".github/scripts/v3-s14-stage-5-running-orders.sh", "utf8");
const stage9 = readFileSync(".github/scripts/v3-s14-stage-9-publication.sh", "utf8");

describe("S14 pre-outcome Results visibility", () => {
  it("fails closed immediately after running-order publication", () => {
    expect(stage5).toContain("publication_config.results");
    expect(stage5).toContain("anonymous pre-outcome Results lookup");
    expect(stage5).toContain("running-order publication leaked");
    expect(stage5).toContain("public.show_publication_enabled(id,'results')");
    expect(stage5).toContain("pg_policies");
    expect(stage5).toContain("tablename='results'");
  });

  it("keeps command-substitution snapshots pure JSON instead of capturing PASS logs", () => {
    expect(stage9).toContain('expect_success "anonymous Results refresh $show_id" >&2');
    expect(stage9).toContain('pre_refresh="$(anonymous_result_snapshot "$show_id")"');
    expect(stage9).toContain('post_refresh="$(anonymous_result_snapshot "$show_id")"');
    expect(stage9).toContain('[[ "$(anonymous_result_snapshot "$show_id")" == "[]" ]]');
  });

  it("captures the exact publication and RLS state before Stage 9 rejects a real leak", () => {
    expect(stage9).toContain("publication_visibility_diagnostic");
    expect(stage9).toContain("PUBLICATION_VISIBILITY_DIAGNOSTIC");
    expect(stage9).toContain("publicationResults");
    expect(stage9).toContain("publicationEnabled");
    expect(stage9).toContain("sourceResultVersion");
    expect(stage9).toContain("frozenConfig");
    expect(stage9).toContain("pg_policies");
    expect(stage9).toContain("resultPolicies");
    expect(stage9).toContain('if [[ "$pre_refresh" != "[]" ]]');
    expect(stage9).toContain("anonymous Results leaked before outcome publication");
  });

  it("keeps both lifecycle scripts syntactically valid", () => {
    for (const script of [
      ".github/scripts/v3-s14-stage-5-running-orders.sh",
      ".github/scripts/v3-s14-stage-9-publication.sh",
    ]) {
      expect(() => execFileSync("bash", ["-n", script], { stdio: "pipe" })).not.toThrow();
    }
  });
});
