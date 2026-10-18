# Solaris V3 failure-injection coverage

## Purpose

Keep S11 recovery evidence honest by distinguishing a failure that has actually been injected and recovered in isolated infrastructure from one that merely has a declared recovery contract.

The machine-readable registry is `src/lib/v3-failure-injection-coverage.ts`. It points to existing deterministic local rehearsals rather than duplicating them. The report is evidence for Chat 5, not release certification.

## Coverage states

- `rehearsed` — an existing local rehearsal injects the failure/replay condition and verifies the expected convergence or recovery behavior.
- `partial` — relevant failure and recovery primitives are exercised, but the requested end-to-end failure sequence is not fully rehearsed.
- `contract_only` — canonical recovery/measurement contracts exist, but no dedicated local failure-injection rehearsal proves the complete path.
- `missing` — no adequate canonical contract/evidence exists yet.

No state requires production traffic.

## Current evidence

### Rehearsed

- **Event consumer failure / unavailable dependency:** the S4 DomainEvent rehearsal claims a delivery, injects `DEPENDENCY_FAILURE`, proves retry, reaches the attempt ceiling/dead-letter state, explicitly requeues the dead letter, reclaims it and completes it.
- **Duplicate delivery:** the same S4 rehearsal proves semantic event replay reuses the immutable event/delivery rows and duplicate completion converges on one immutable consumer receipt.
- **Stale projection:** the S11 stale-projection rehearsal creates an inactive Solaris scheduler job as canonical source truth, deletes only its derived Organizer Task, invokes the declared edition-bounded task rebuild, and proves the restored task semantically matches the pre-corruption projection.
- **Reconciliation retry:** that rehearsal deliberately makes the first projection write fail, verifies the failed repair leaves no partial task and does not alter scheduler truth, then retries the same canonical rebuild path and proves one exact projection plus idempotent replay.

### Partial

- **Lost response after commit:** S2 proves the underlying committed-operation replay semantics by completing an operation and then replaying the same normalized semantic request, but the rehearsal does not actually discard or interrupt the original client response after commit. This remains partial until a dedicated local transport-loss injection proves recovery from that real failure sequence.
- **Transient RPC failure:** S2 rehearses a `TIMEOUT` uncertain receipt and actor-scoped reconciliation, but it does not yet sever/lose one real workflow RPC response around a committed mutation and prove end-to-end recovery.

### Contract-only

- **Queue backlog:** S12 defines `reconciliation-backlog-drain` and measures queue/retry pressure, but representative backlog-drain evidence has not yet been executed and retained.

## Stale projection / retry rehearsal

Run only against local Supabase:

```bash
bash .github/scripts/v3-s11-stale-projection-rehearsal.sh
```

The rehearsal hard-refuses hosted/non-loopback database targets. It wraps the entire fixture in a transaction and rolls it back, so the synthetic edition, cron job, corrupted projection and injected trigger never persist. It intentionally modifies only derived Organizer Task state; the inactive `cron.job` row remains authoritative throughout the failure and retry sequence.

## Generate exact-SHA evidence

```bash
V3_FAILURE_COVERAGE_SHA=$(git rev-parse HEAD) \
V3_FAILURE_COVERAGE_ENVIRONMENT=repository-static \
V3_FAILURE_COVERAGE_OUTPUT=./artifacts/v3-failure-injection-coverage.json \
npx tsx scripts/generate-v3-failure-injection-coverage.ts
```

The generator is offline. It does not connect to Supabase or create traffic. It verifies that `V3_FAILURE_COVERAGE_SHA` exactly matches the checked-out `git rev-parse HEAD` before emitting evidence, and it creates the requested output directory recursively so the documented `./artifacts/...` path works on a clean checkout.

`V3_FAILURE_COVERAGE_REQUIRE_ALL_REHEARSED=1` may be used by a deliberate release-evidence review to fail when unresolved scenarios remain. Chat 7 does not wire this into broad CI; Chat 5 owns release certification and broad workflow policy.

## Next recovery rehearsals

The remaining highest-value executable evidence is:

1. **transient/lost workflow response** — run one real R2/R3 mutation locally, discard/interrupt the client response after commit, retry the same semantic request and verify the durable receipt/result is returned;
2. **reconciliation backlog drain** — generate a bounded local backlog with an evidence-backed load shape, drain it through normal consumers/reconciliation, and retain queue/retry plus normal-workload latency evidence.

These rehearsals must remain local/isolated. Deliberately breaking production to prove that recovery works would be a remarkably literal interpretation of reliability engineering.
