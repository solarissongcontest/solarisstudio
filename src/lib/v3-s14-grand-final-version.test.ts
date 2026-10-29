import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(".github/scripts/v3-s14-grand-final-results.sh", "utf8");
// Execute the actual fixture sequence with a strict versioned-operation double.
// A stale expected version fails just as the canonical PT409 guard does.
const start = source.indexOf('  # Governed Jury review recalculates Results.');
const end = source.indexOf('  [[ "$(db_scalar "select count(*) from public.results', start);
const sequence = source.slice(start, end);

describe("S14 final calculation after governed Jury review", () => {
  it.each([0, 66])("uses persisted version %i and retains two successive immutable calculations", (base) => {
    const output = execFileSync("bash", ["-c", `
set -euo pipefail
FINAL_ID=local-final
version=${base}
fail() { echo "$*" >&2; exit 1; }
log() { :; }
result_snapshot_value() { printf '%s' "$version"; }
execute_result_operation() {
  [[ "$3" == "$version" ]] || fail "stale expected version $3, persisted $version"
  printf '%s:%s\\n' "$2" "$3"
  if [[ "$2" == calculate ]]; then version=$((version+1)); fi
}
expect_json() { [[ "$3" == "$version" ]] || fail 'wrong returned version'; }
assert_s14_final_televote_source_parity() { :; }
immutable_result_snapshot_hash() {
  [[ "$2" == "${base + 1}" || "$2" == "${base + 2}" ]] || fail 'wrong immutable version'
  echo identical-canonical-rows
}
current_result_snapshot_hash() { echo identical-canonical-rows; }
db_scalar() {
  if [[ "$1" == *result_row_count* ]]; then echo 20; else echo 2; fi
}
run_sequence() {
${sequence}
}
run_sequence
printf 'final:%s\\n' "$FINAL_RESULT_VERSION"
`], { encoding: "utf8" });
    expect(output.trim().split("\n")).toEqual([
      `calculate:${base}`, `calculate:${base + 1}`, `review:${base + 2}`,
      `lock:${base + 2}`, `mark_reveal_ready:${base + 2}`, `final:${base + 2}`,
    ]);
  });
});
