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

- **Event consumer failure:** retained S4 evidence fails a claimed DomainEvent delivery, proves retry/dead-letter handling and explicit requeue recovery.
- **Duplicate delivery:** retained S4 evidence proves semantic replay and duplicate completion converge on one immutable consumer receipt.

### Rehearsal-ready

- **Stale projection:** `.github/scripts/v3-s11-stale-projection-rehearsal.sh` deletes only a derived Organizer Task while retaining its canonical inactive Solaris scheduler-job source, then invokes the declared edition-bounded rebuild and asserts semantic convergence.
- **Reconciliation retry:** the same script deliberately makes the first projection write fail, proves no partial task and unchanged canonical scheduler truth, retries the same rebuild path and asserts single-row idempotent convergence.
- **Lost response after commit:** `.github/scripts/v3-s11-lost-response-rehearsal.sh` sends a real governed Jury-window R2 mutation through a loopback proxy. The proxy fully consumes the upstream HTTP 200 response and then destroys the downstream socket without forwarding response bytes. The script verifies the operation receipt, Jury state/version and `jury.closed` DomainEvent committed exactly once before exact retry.
- **Transient RPC failure:** the same response-drop path gives the caller a real transport failure around a real governed RPC, after which exact canonical retry must return the durable committed result without re-executing the mutation.
- **Queue backlog:** `.github/scripts/v3-s11-backlog-drain-rehearsal.sh` generates a bounded backlog through real `jury.closed` R2 operations, deliberately leaves their `jury.tasks` consequences pending, samples ordinary PostgREST reads concurrently, and drains only through the canonical S4 claim plus Jury consumer path.

All five remain `rehearsal_ready` until isolated local runs are retained against the exact candidate SHA. The already-retained S4 evidence remains separately `rehearsed`; existence of a shell script is not retroactively a successful test run, because paperwork has caused enough damage already.

### Partial

- **Unavailable dependency:** existing S4 evidence can classify a failed delivery as `DEPENDENCY_FAILURE` and prove the retry/dead-letter/requeue mechanics. That is not the same thing as making a real dependency unavailable. This scenario remains partial until an isolated deterministic rehearsal removes or blocks a real dependency at a canonical operation/consumer boundary, observes the dependency-classified failure, restores the dependency, and proves convergence.

Do not promote this scenario merely because an error code can be supplied to the S4 failure RPC. Classification is not failure injection.

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

The script uses run-unique fixture identities and intentionally does not delete immutable S4 event/receipt history. Run it against disposable local Supabase and reset that local database after evidence is retained.

## Bounded backlog-drain rehearsal

The backlog rehearsal has **no built-in load number or latency threshold**. The caller must supply an explicit load shape and its provenance:

```bash
V3_S11_BACKLOG_EVENTS=<evidence-backed-event-count> \
V3_S11_DRAIN_BATCH=<bounded-batch-size-1-to-100> \
V3_S11_READ_REQUESTS=<ordinary-read-sample-count> \
V3_S11_BACKLOG_SHA=$(git rev-parse HEAD) \
V3_S11_BACKLOG_LOAD_SOURCE=<documented-source> \
V3_S11_BACKLOG_LOAD_RATIONALE='<why-this-load-shape>' \
V3_S11_BACKLOG_OUTPUT=./artifacts/v3-s11-backlog-drain.json \
bash .github/scripts/v3-s11-backlog-drain-rehearsal.sh
```

Allowed load sources match the S12 evidence vocabulary: `production-telemetry`, `contest-participation-or-audience`, `provider-constraint`, `historical-peak`, `approved-forecast`, `explicit-rehearsal-plan`, or `exploratory`.

Safety and correctness boundaries:

- hosted API/database targets are refused;
- the supplied SHA must exactly equal `git rev-parse HEAD`;
- the script refuses to start when the isolated local database already has actionable `jury.tasks` work, because the canonical claim is consumer-wide rather than edition-scoped;
- backlog is created by real `studio2_apply_jury_voting_status` operations, never direct outbox insertion;
- drain batches use `studio2_claim_domain_event_deliveries` and are bounded to the S4 maximum of 100;
- each claimed event is processed by `studio2_process_jury_domain_event`;
- claims are rejected if they escape the synthetic edition;
- completion requires exactly one immutable consumer receipt per fixture event, zero fixture dead letters, zero retry attempts and backlog depth zero;
- ordinary local reads run in parallel and must all succeed;
- output records drain duration/throughput, per-batch backlog reduction, ordinary-read p50/p95/p99/max, retries/dead letters and exact evidence identity;
- output carries `thresholds: null` and `certificationClaim: false`.

The rehearsal deliberately leaves immutable S4 ledger rows in the disposable local database. Reset local Supabase after retaining the report. Do not add cleanup code that defeats the immutability contract merely because test data has become aesthetically inconvenient.

## Generate static exact-SHA coverage evidence

```bash
V3_FAILURE_COVERAGE_SHA=$(git rev-parse HEAD) \
V3_FAILURE_COVERAGE_ENVIRONMENT=repository-static \
V3_FAILURE_COVERAGE_OUTPUT=./artifacts/v3-failure-injection-coverage.json \
npx tsx scripts/generate-v3-failure-injection-coverage.ts
```

The generator is offline. It verifies that `V3_FAILURE_COVERAGE_SHA` exactly matches `git rev-parse HEAD`, refuses a dirty worktree including untracked files, creates requested output directories recursively, and makes no certification claim.

`V3_FAILURE_COVERAGE_REQUIRE_ALL_REHEARSED=1` can be used only in a deliberate release-evidence review. Chat 7 does not wire broad CI; Chat 5 owns release certification and workflow policy.

## Remaining reliability work

The current S11 implementation inventory is intentionally not declared complete:

1. execute and retain exact-SHA evidence for each `rehearsal_ready` path against isolated local Supabase;
2. retain the backlog JSON report and corresponding local/runtime evidence;
3. implement a deterministic **real unavailable-dependency** rehearsal instead of substituting an injected `DEPENDENCY_FAILURE` label;
4. promote a scenario to `rehearsed` only after its run is objectively retained;
5. let Chat 5 decide whether the resulting evidence is sufficient for release certification.

All rehearsals remain local/isolated. Production is not a chaos-testing playground, despite software's occasional attempts to become one on its own.
