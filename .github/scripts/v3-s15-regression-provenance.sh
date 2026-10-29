#!/usr/bin/env bash
set -euo pipefail

# Pure unit regressions only. The caller supplies loopback-only static environment;
# Bun must never load a workspace .env while reproducing the historical defects.
root="$(git rev-parse --show-toplevel)"
baseline="96b76574b86f24c6f9ed5089ec853759683d7ab6"
proof_dir="${V3_PREFLIGHT_DIR:-$root/v3-release-preflight/static}/regression-provenance"
mkdir -p "$proof_dir"
proof_dir="$(cd "$proof_dir" && pwd)"
checkout="$(mktemp -d "${RUNNER_TEMP:-/tmp}/s15-baseline.XXXXXX")"
rmdir "$checkout"
cleanup() { git -C "$root" worktree remove --force "$checkout" >/dev/null 2>&1 || true; }
trap cleanup EXIT
git worktree add --detach "$checkout" "$baseline" >/dev/null
ln -s "$root/node_modules" "$checkout/node_modules"
for file in authenticated-identity-isolation.test.ts v3-receipt-reconciliation-consequence.test.ts organizer-task-account-isolation.test.ts v3-public-supplement-transitions.test.ts; do
  cp "$root/src/lib/$file" "$checkout/src/lib/$file"
done

set +e
(cd "$checkout" && bun --env-file=/dev/null test src/lib/authenticated-identity-isolation.test.ts) >"$proof_dir/identity-before.log" 2>&1
identity_status=$?
(cd "$checkout" && bun --env-file=/dev/null test src/lib/v3-receipt-reconciliation-consequence.test.ts -t 'preserves the catalog identity|does not publish or invalidate') >"$proof_dir/receipt-before.log" 2>&1
receipt_status=$?
(cd "$checkout" && bun --env-file=/dev/null test src/lib/organizer-task-account-isolation.test.ts) >"$proof_dir/tasks-before.log" 2>&1
tasks_status=$?
(cd "$checkout" && bun --env-file=/dev/null test src/lib/v3-public-supplement-transitions.test.ts) >"$proof_dir/supplement-before.log" 2>&1
supplement_status=$?
set -e
[[ "$identity_status" -eq 1 && "$receipt_status" -eq 1 && "$tasks_status" -eq 1 && "$supplement_status" -eq 1 ]] || { echo "Historical regression did not fail as expected" >&2; exit 1; }
python3 - "$proof_dir" <<'PY'
from pathlib import Path
import re
import sys
directory = Path(sys.argv[1])
identity = (directory / "identity-before.log").read_text()
receipt = (directory / "receipt-before.log").read_text()
tasks = (directory / "tasks-before.log").read_text()
supplement = (directory / "supplement-before.log").read_text()
# The supplement guard now also rejects unsupported forward promotions. The
# historical implementation lacks that check in addition to rollback/removal.
for output, count in [(identity, 5), (receipt, 2), (tasks, 4), (supplement, 3)]:
    if not re.search(rf"(?<![0-9]){count} fail(?![a-z])", output):
        raise SystemExit("Historical proof failed for an unexpected reason; inspect stored logs")
    if any(marker in output for marker in ["Cannot find module", "Cannot find package", "SyntaxError", "is not a function"]):
        raise SystemExit("Historical proof encountered a tooling failure")
if "prevents a delayed getSession read from overwriting a newer SDK session event" not in identity:
    raise SystemExit("Historical delayed-session overwrite regression was not observed")
if "toBeUndefined" not in identity or "replaced-by-read" not in receipt or "declared" not in receipt or "visible-only-to-A" not in tasks:
    raise SystemExit("Expected owner defects were not observed")
for case in ["rejects backward status changes in discovered capabilities", "rejects silent removal from the combined canonical inventory", "rejects a forward transition without exact-tree acceptance evidence"]:
    if not re.search(r"\(fail\).*" + re.escape(case), supplement):
        raise SystemExit("Expected supplement authority defect was not observed: " + case)
print("PASS: original identity/task cache, receipt model and supplement guard defects reproduced")
PY
cd "$root"
bun --env-file=/dev/null test src/lib/authenticated-identity-isolation.test.ts src/lib/v3-receipt-reconciliation-consequence.test.ts src/lib/organizer-task-account-isolation.test.ts src/lib/v3-public-supplement-transitions.test.ts >"$proof_dir/after.log" 2>&1
echo "PASS: all owner regressions pass on the current candidate"
