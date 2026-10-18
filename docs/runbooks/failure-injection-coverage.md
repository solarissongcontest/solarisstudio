# Solaris V3 failure-injection coverage

## Purpose

Keep S11 recovery evidence honest by distinguishing retained executed rehearsals from executable recovery tooling that still awaits exact-SHA run evidence.

The machine-readable registry is `src/lib/v3-failure-injection-coverage.ts`. It points to deterministic local rehearsals rather than duplicating them. The report is evidence for Chat 5, not release certification.

## Coverage states

- `rehearsed` — a deterministic local rehearsal has actually run and retained evidence proves the expected convergence/recovery behavior.
- `rehearsal_ready` — the deterministic local injection/recovery path and regression proof are implemented, but retained exact-SHA execution evidence is still pending.
- `partial` — relevant failure and recovery primitives are exercised, but the requested end-to-end failure sequence is incomplete.
- `contract_only` — canonical recovery/measurement contracts exist, but no dedicated local failure-injection rehearsal is implemented yet.
- `missing` — no adequate canonical contract/evidence exists yet.

No state requires production traffic.

## Current evidence

### Rehearsed

- **Event consumer failure / unavailable dependency:** the existing S4 DomainEvent rehearsal injects `DEPENDENCY_FAILURE`, proves retry, dead-letter and explicit requeue recovery.
- **Duplicate delivery:** retained S4 evidence proves semantic replay and duplicate completion converge on one immutable consumer receipt.

### Rehearsal-ready

- **Stale projection:** `.github/scripts/v3-s11-stale-projection-rehearsal.sh` creates an inactive Solaris scheduler job as canonical source truth, deletes only its derived Organizer Task, invokes the declared edition-bounded rebuild, and asserts semantic convergence.
- **Reconciliation retry:** that same script deliberately makes the first projection write fail, asserts no partial task and unchanged scheduler truth, then retries the same canonical rebuild path and asserts single-row idempotent convergence.

These two remain `rehearsal_ready` until Chat 5 (or another release-evidence runner) executes the script against isolated local Supabase and retains exact-SHA run evidence.

### Partial

- **Lost response after commit:** S2 proves committed-operation replay semantics, but this branch does not yet include retained execution evidence for a real discarded post-commit workflow response.
- **Transient RPC failure:** S2 proves `TIMEOUT` uncertainty and reconciliation primitives, but this branch does not yet include retained execution evidence for a real workflow transport failure.

### Contract-only

- **Queue backlog:** S12 defines `reconciliation-backlog-drain` and queue/retry measurements, but a deterministic backlog-drain rehearsal still needs implementation and execution.

## Stale projection / retry rehearsal

Run only against local Supabase:

```bash
bash .github/scripts/v3-s11-stale-projection-rehearsal.sh
```

The rehearsal hard-refuses hosted/non-loopback database targets. It wraps the fixture in a transaction and rolls it back, so the synthetic edition, cron job, corrupted projection and injected trigger never persist. It modifies only derived Organizer Task state; the inactive `cron.job` row remains authoritative throughout the failure and retry sequence.

A successful run is necessary before these scenarios may move from `rehearsal_ready` to `rehearsed`.

## Generate exact-SHA evidence

```bash
V3_FAILURE_COVERAGE_SHA=$(git rev-parse HEAD) \
V3_FAILURE_COVERAGE_ENVIRONMENT=repository-static \
V3_FAILURE_COVERAGE_OUTPUT=./artifacts/v3-failure-injection-coverage.json \
npx tsx scripts/generate-v3-failure-injection-coverage.ts
```

The generator is offline. It verifies that `V3_FAILURE_COVERAGE_SHA` exactly matches `git rev-parse HEAD`, creates requested output directories recursively, and makes no certification claim.

`V3_FAILURE_COVERAGE_REQUIRE_ALL_REHEARSED=1` can be used in a deliberate release-evidence review. Chat 7 does not wire this into broad CI; Chat 5 owns release certification and broad workflow policy.

## Next reliability work

1. Execute and retain exact-SHA evidence for the stale-projection/retry rehearsal.
2. Rehearse a real post-commit response loss / transport failure through a governed R2/R3 operation.
3. Implement and execute a bounded reconciliation-backlog drain rehearsal with queue/retry and ordinary-workload measurements.

All rehearsals remain local/isolated. Production is not a chaos-testing playground, despite software's occasional attempts to become one on its own.
