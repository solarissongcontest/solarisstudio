import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const archive = readFileSync(".github/scripts/v3-s14-stage-10-archive.sh", "utf8");
const stage8 = readFileSync(".github/scripts/v3-s14-stage-8-results.sh", "utf8");

describe("S14 Archive worker execution context", () => {
  it("claims and processes through the shared service helper with explicit worker claims", () => {
    const helper = stage8.slice(stage8.indexOf("service_value() {"), stage8.indexOf("\n}\n") + 3);
    const start = archive.indexOf('  claimed_archive_events=');
    const end = archive.indexOf('  [[ "$(db_scalar "select status', start);
    const block = archive.slice(start, end);
    const output = execFileSync("bash", ["-c", `
set -euo pipefail
DB_URL=local-only-test-double
S14_ARCHIVE_WORKER_ID=archive-worker
archive_event_id=archive-event
fail() { echo "$*" >&2; exit 1; }
db_scalar() { fail 'worker SQL lost service claims'; }
psql() {
  [[ "$*" == *request.jwt.claim.role*service_role*request.jwt.claims*service_role* ]] || fail 'missing service claims'
  case "$*" in
    *studio2_claim_domain_event_deliveries*) echo archive-event;;
    *studio2_process_edition_domain_event*) echo true;;
    *) fail 'unexpected worker operation';;
  esac
}
${helper}
${block}
echo worker-context-verified
`], { encoding: "utf8" });
    expect(output.trim()).toBe("worker-context-verified");
    expect(archive).toContain('service_value "select private.v3_reconcile_resolved_task_notifications');
  });

  it("retains all three exact publication versions across Archive", () => {
    for (const [show, version] of [
      ["SEMI_ONE_ID", "SEMI_ONE_RESULT_VERSION"],
      ["SEMI_TWO_ID", "SEMI_TWO_RESULT_VERSION"],
      ["FINAL_ID", "FINAL_RESULT_VERSION"],
    ]) {
      expect(archive).toContain(`assert_anonymous_result_matches_version "$${show}" "$${version}"`);
    }
  });
});
