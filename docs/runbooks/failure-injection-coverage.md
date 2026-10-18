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

- **Event consumer failure / unavailable dependency:** retained S4 evidence injects `DEPENDENCY_FAILURE`, proves retry, dead-letter and explicit requeue recovery.
- **Duplicate delivery:** retained S4 evidence proves semantic replay and duplicate completion converge on one immutable consumer receipt.

### Rehearsal-ready

- **Stale projection:** `.github/scripts/v3-s11-stale-projection-rehearsal.sh` deletes only a derived Organizer Task while retaining its canonical inactive Solaris scheduler-job source, then invokes the declared edition-bounded rebuild and asserts semantic convergence.
- **Reconciliation retry:** the same script deliberately makes the first projection write fail, proves no partial task and unchanged canonical scheduler truth, retries the same rebuild path and asserts single-row idempotent convergence.
- **Lost response after commit:** `.github/scripts/v3-s11-lost-response-rehearsal.sh` sends a real governed Jury-window R2 mutation through a loopback proxy. The proxy fully consumes the upstream HTTP 200 response and then destroys the downstream socket without forwarding response bytes. The script verifies the operation receipt, Jury state/version and `jury.closed` DomainEvent committed exactly once before exact retry.
- **Transient RPC failure:** the same response-drop path gives the caller a real transport failure around a real governed RPC, after which exact canonical retry must return the durable committed result without re-executing the mutation.

These four remain `rehearsal_ready` until isolated local runs are retained against the exact candidate SHA.

### Contract-only

- **Queue backlog:** S12 defines `reconciliation-backlog-drain` and queue/retry measurements, but a deterministic backlog-drain rehearsal still needs implementation and execution.

## Stale projection / retry rehearsal

```bash
bash .github/scripts/v3-s11-stale-projection-rehearsal.sh
```

The script hard-refuses hosted/non-loopback database targets. It wraps the fixture in a transaction and rolls it back, so the synthetic edition, cron job, corrupted projection and injected failure trigger never persist. It modifies only derived Organizer Task state.

## Lost response / transport-failure rehearsal

```bash
bash .github/scripts/v3-s11-lost-response-rehearsal.sh
```

The script creates an isolated draft edition/show and uses the real `studio2_apply_jury_voting_status` R2 RPC. `scripts/v3-drop-upstream-response-proxy.mjs` accepts one loopback request, forwards it only to loopback Supabase, fully consumes the upstream response and then destroys the downstream socket. It records no tokens or request headers.

Before retry, the script verifies the durable succeeded receipt, `closed` Jury state, version `1` and exactly one `jury.closed` DomainEvent. It then retries the exact operation with the original `operation_id`, idempotency key and stale `expectedVersion=0`; the replay must return `previousVersion=0` / `version=1` while receipt/event counts and version stay unchanged. Any true second execution would hit mutable version 1 and/or advance it again.

## Generate exact-SHA evidence

```bash
V3_FAILURE_COVERAGE_SHA=$(git rev-parse HEAD) \
V3_FAILURE_COVERAGE_ENVIRONMENT=repository-static \
V3_FAILURE_COVERAGE_OUTPUT=./artifacts/v3-failure-injection-coverage.json \
npx tsx scripts/generate-v3-failure-injection-coverage.ts
```

The generator is offline. It verifies that `V3_FAILURE_COVERAGE_SHA` exactly matches `git rev-parse HEAD`, creates requested output directories recursively, and makes no certification claim.

`V3_FAILURE_COVERAGE_REQUIRE_ALL_REHEARSED=1` can be used only in a deliberate release-evidence review. Chat 7 does not wire broad CI; Chat 5 owns release certification and workflow policy.

## Remaining reliability work

1. Execute and retain exact-SHA evidence for the four `rehearsal_ready` scenarios.
2. Implement and execute a bounded reconciliation-backlog drain rehearsal with queue/retry and ordinary-workload measurements.

All rehearsals remain local/isolated. Production is not a chaos-testing playground, despite software's occasional attempts to become one on its own.
