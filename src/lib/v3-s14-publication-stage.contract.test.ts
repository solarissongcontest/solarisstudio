import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_S14_INVARIANTS, V3_S14_STAGES } from "../../scripts/v3-s14-full-contest-spec";

const source = (path: string) => readFileSync(path, "utf8");
const driver = source(".github/scripts/v3-full-contest-rehearsal.sh");
const stage9 = source(".github/scripts/v3-s14-stage-9-publication.sh");
const publicationInvariant = source("supabase/migrations/20261015164100_v3_s3_publication_invariants.sql");
const publicationLifecycle = source("supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql");

describe("S14 Stage 9 publication boundary", () => {
  it("stays prepared but unwired until Stage 8 can genuinely finalize results", () => {
    expect(V3_S14_STAGES.find((stage) => stage.id === "stage-9-publication")?.implementationState).toBe("planned");
    expect(V3_S14_INVARIANTS.find((item) => item.id === "publication-final-version")?.implementationState).toBe("planned");
    expect(driver).not.toContain('source "$SCRIPT_DIR/v3-s14-stage-9-publication.sh"');
    expect(driver).not.toContain("run_s14_stage_9_publication");
  });

  it("requires the exact immutable result version before outcome publication", () => {
    expect(stage9).toContain("private.v3_result_versions");
    expect(stage9).toContain("version=2");
    expect(stage9).toContain("reviewed_version=2");
    expect(stage9).toContain("locked_version=2");
    expect(stage9).toContain("reveal_ready_version=2");
    expect(stage9).toContain("sourceResultVersion 2");
    expect(stage9).toContain("source_result_version=2");
    expect(publicationInvariant).toContain("v3_publication_result_version_release_ready");
    expect(publicationInvariant).toContain("Public outcome projection lacks exact finalized result-version provenance");
  });

  it("publishes through governed preview/apply authority with receipt and DomainEvent evidence", () => {
    expect(stage9).toContain("studio2_show_publication_change_preview");
    expect(stage9).toContain("studio2_apply_show_publication_change");
    expect(stage9).toContain("publication.show.change");
    expect(stage9).toContain("publication.changed");
    expect(stage9).toContain("studio2_operation_receipts");
    expect(stage9).toContain("private.v3_domain_events");
    expect(publicationLifecycle).toContain("studio2_require_fresh_auth(300)");
  });

  it("verifies the anonymous public projection rather than privileged SQL alone", () => {
    expect(stage9).toContain('$API_URL/rest/v1/shows');
    expect(stage9).toContain('$API_URL/rest/v1/results');
    expect(stage9).toContain("anonymous finalized result layer visible");
    expect(stage9).toContain('public_rows" == "33"');
    expect(stage9).toContain("unreconciled totals");
  });

  it("contains the eventual completion markers without claiming them from the current driver", () => {
    expect(stage9).toContain("S14_INVARIANT_PUBLICATION_COMPLETE");
    expect(stage9).toContain("S14_STAGE_9_PUBLICATION_COMPLETE");
    expect(driver).not.toContain("S14_STAGE_9_PUBLICATION_COMPLETE");
  });

  it("keeps the Stage 9 shell syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-s14-stage-9-publication.sh"], { stdio: "pipe" }),
    ).not.toThrow();
  });
});
