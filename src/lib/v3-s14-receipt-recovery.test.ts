import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("S14 actor-scoped durable receipt recovery", () => {
  it.each([
    ".github/scripts/v3-full-contest-rehearsal.sh",
    ".github/scripts/v3-s14-stage-10-archive.sh",
  ])("uses the Organizer session and verifies the exact succeeded receipt in %s", (path) => {
    const source = readFileSync(path, "utf8");
    const start = source.indexOf("  # Receipt recovery is actor-scoped");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start).split("\n\n")[0];
    const output = execFileSync("bash", ["-c", `
set -euo pipefail
ORGANIZER_A_TOKEN=organizer-session
S14_RESULTS_RECONCILE_OPERATION_ID=owned-operation
S14_ARCHIVE_OPERATION_ID=owned-operation
rpc_request() {
  [[ "$1" == organizer-session && "$2" == studio2_reconcile_operation ]]
  [[ "$3" == '{"p_operation_id":"owned-operation"}' ]]
  echo authenticated-owned-receipt
}
expect_success() { :; }
expect_json() {
  case "$2" in
    operationId) [[ "$3" == owned-operation ]];;
    status) [[ "$3" == succeeded ]];;
    *) exit 1;;
  esac
  echo "verified:$2"
}
${block}
`], { encoding: "utf8" });
    expect(output.trim().split("\n")).toEqual([
      "authenticated-owned-receipt", "verified:operationId", "verified:status",
    ]);
    expect(source).not.toContain("select public.studio2_reconcile_operation");
  });
});
