import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const driver = readFileSync(".github/scripts/v3-full-contest-rehearsal.sh", "utf8");
const start = driver.indexOf("write_final_evidence() {");
const end = driver.indexOf("\n  EVIDENCE_WRITTEN=1\n}", start) + "\n  EVIDENCE_WRITTEN=1\n}".length;
const writer = driver.slice(start, end);

describe("S14 final Archive provenance evidence", () => {
  it("emits complete evidence using the completed outbox row's composite identity", () => {
    const dir = mkdtempSync(join(tmpdir(), "s14-final-evidence-"));
    const path = join(dir, "s14-full-contest.json");
    const event = "14000000-0000-4000-8000-000000000999";
    try {
      execFileSync("bash", ["-c", `
set -euo pipefail
FINAL_PATH="$1"
CANDIDATE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
S14_RUN_ID=local-evidence-regression
EDITION_ID=local-edition
DATABASE_FINGERPRINT=local-database
S14_RESULTS_RECONCILE_OPERATION_ID=results-operation
S14_POST_EDITION_OPERATION_ID=post-operation
S14_ARCHIVE_OPERATION_ID=archive-operation
assert_same_persistent_contest() { :; }
s14_result_evidence_hash() { echo retained-results; }
s14_publication_evidence_hash() { echo retained-publication; }
fail() { echo "$*" >&2; exit 1; }
db_scalar() {
  case "$1" in
    *"select count(*) from public.studio2_operation_receipts"*) echo 20;;
    *"select id::text from private.v3_domain_events"*) echo ${event};;
    *"from private.v3_domain_event_outbox"*)
      [[ "$1" == *"event_id::text || ':' || consumer_key"* && "$1" == *"status='completed'"* ]] || fail 'invalid outbox identity query'
      echo '${event}:edition.tasks';;
    *"from private.v3_domain_event_consumer_receipts"*) echo 1;;
    *) fail 'unexpected provenance SQL';;
  esac
}
${writer}
write_final_evidence
[[ "$EVIDENCE_WRITTEN" == 1 ]]
`, "--", path], { stdio: "pipe" });
      const evidence = JSON.parse(readFileSync(path, "utf8"));
      expect(evidence).toMatchObject({
        passed: true, partial: false, runtimeFailure: false,
        lifecycle: { finalState: "archived" },
        pendingStages: [], pendingContestExtensions: [], blockedContestExtensions: [],
        archive: {
          eventId: event, outboxId: `${event}:edition.tasks`,
          outboxKey: { eventId: event, consumerKey: "edition.tasks" },
          consequenceConsumerReceiptCount: 1,
        },
      });
      expect(evidence.completedStages).toHaveLength(10);
      expect(evidence.completedContestExtensions).toHaveLength(4);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
