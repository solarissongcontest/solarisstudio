import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const workflow = readFileSync(".github/workflows/v3-s14-full-contest-rehearsal.yml", "utf8");
const outboxSchema = readFileSync(
  "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
  "utf8",
);

describe("S14 Grand Final failure evidence", () => {
  it("tracks contest extensions as first-class runtime failure stages", () => {
    expect(driver).toContain("COMPLETED_CONTEST_EXTENSIONS=()");
    expect(driver).toContain('CURRENT_STAGE="$extension_id"');
    expect(driver).toContain('COMPLETED_CONTEST_EXTENSIONS+=("$extension_id")');
    expect(driver).toContain('"${COMPLETED_CONTEST_EXTENSIONS[*]}"');
    expect(driver).toContain('"completedContestExtensions": completed_extensions');
  });

  it("runs qualifier preparation, final voting, canonical results, and publication through the tracked extension wrapper", () => {
    expect(driver).toContain(
      "run_contest_extension grand-final-qualifier-bridge prepare_s14_grand_final_from_qualifiers",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-voting run_s14_grand_final_voting",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-results run_s14_grand_final_results",
    );
    expect(driver).toContain(
      "run_contest_extension grand-final-publication run_s14_grand_final_publication",
    );
  });

  it("requires the runtime-tracked stages and extensions to be complete before final evidence is written", () => {
    expect(driver).toContain('[[ "${#COMPLETED_STAGES[@]}" == "${#ALL_STAGES[@]}" ]]');
    expect(driver).toContain(
      '[[ "${#COMPLETED_CONTEST_EXTENSIONS[@]}" == "${#ALL_CONTEST_EXTENSIONS[@]}" ]]',
    );
    expect(driver).toContain('"completedStages": [');
    expect(driver).toContain('"completedContestExtensions": [');
    expect(driver).toContain('"pendingStages": []');
    expect(driver).toContain('"pendingContestExtensions": []');
    expect(workflow).toContain('data.get("completedStages") != expected_stages');
    expect(workflow).toContain('data.get("completedContestExtensions") != expected_extensions');
  });

  it("uses the same canonical Grand Final extension vocabulary for success and failure evidence", () => {
    for (const extension of [
      "grand-final-qualifier-bridge",
      "grand-final-voting",
      "grand-final-results",
      "grand-final-publication",
    ]) {
      expect(driver).toContain(extension);
      expect(workflow).toContain(extension);
    }
    expect(driver).not.toContain('"grand-final-jury"');
    expect(driver).not.toContain('"grand-final-televote"');
    expect(workflow).not.toContain('"grand-final-jury"');
    expect(workflow).not.toContain('"grand-final-televote"');
  });

  it("does not preserve the resolved #651 synthetic blocker", () => {
    expect(driver).not.toContain("#651 canonical Televote publication/readiness mismatch");
    expect(driver).toContain('source "$SCRIPT_DIR/v3-s14-grand-final-results.sh"');
  });

  it("records Archive outbox provenance using the real composite key", () => {
    expect(outboxSchema).toContain("primary key (event_id, consumer_key)");
    expect(driver).toContain(
      "select event_id::text || ':' || consumer_key from private.v3_domain_event_outbox",
    );
    expect(driver).toContain(
      "and consumer_key='edition.tasks' and status='completed' limit 1;",
    );
    expect(driver).not.toContain(
      "select id::text from private.v3_domain_event_outbox",
    );
    expect(driver).toContain('"outboxId": archive_outbox_id');
  });

  it("classifies failures during final evidence writing without blaming completed Archive", () => {
    expect(driver).toContain('CURRENT_STAGE="final-evidence"');
    expect(driver).toContain(
      '"results-runtime-reconciliation", "final-evidence"',
    );
    expect(workflow).toContain('"results-runtime-reconciliation", "final-evidence"');
    expect(driver.indexOf('CURRENT_STAGE="final-evidence"')).toBeGreaterThan(
      driver.indexOf("run_stage stage-10-archive run_s14_stage_10_archive"),
    );
  });

  it("keeps the merged stateful driver syntactically valid", () => {
    expect(() =>
      execFileSync("bash", ["-n", ".github/scripts/v3-full-contest-rehearsal.sh"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
