# Solaris V3 failure-injection coverage

## Purpose

Keep S11 recovery evidence honest by distinguishing retained executed rehearsals from executable recovery tooling that still awaits exact-SHA run evidence.

The machine-readable registry is `src/lib/v3-failure-injection-coverage.ts`. It points to deterministic local rehearsals rather than duplicating them. This inventory is input to release evidence, not release certification by itself.

## Safety boundary

Every destructive or failure-injection path in this runbook is local-only. The rehearsals refuse hosted Supabase/API/database targets and do not require production traffic.

Do not substitute production for a missing local fixture, dependency, test user, or data set. A failed local setup is a failed rehearsal, not an invitation to make production interesting.

## Coverage states

- `rehearsed` — retained evidence proves a deterministic local rehearsal actually ran and recovered as expected.
- `rehearsal_ready` — the deterministic local injection/recovery path and source-level regression proof are implemented, but retained exact-SHA execution evidence is still pending.
- `partial` — relevant primitives exist but the requested end-to-end sequence is incomplete.
- `contract_only` — canonical recovery contracts exist but no dedicated local rehearsal exists.
- `missing` — no adequate canonical contract/evidence exists.

No state requires production traffic.

## Current inventory

### Rehearsed

- **Event consumer failure:** retained S4 evidence fails a claimed DomainEvent delivery, proves retry/dead-letter handling and explicit requeue recovery.
- **Duplicate delivery:** retained S4 evidence proves semantic replay and duplicate completion converge on one immutable consumer receipt.

### Rehearsal-ready

- **Stale projection:** `.github/scripts/v3-s11-stale-projection-rehearsal.sh` removes only a derived Organizer Task while retaining its canonical scheduler source, then rebuilds and verifies semantic convergence.
- **Reconciliation retry:** the same rehearsal forces the first projection write to fail, proves rollback safety, retries the declared rebuild path, and verifies one converged task.
- **Lost response after commit:** `.github/scripts/v3-s11-lost-response-rehearsal.sh` commits a governed Jury-window mutation through a loopback proxy, drops the client response after upstream success, and proves exact retry replays durable state without re-execution.
- **Transient RPC failure:** the response-drop path gives the caller a real transport failure around a real governed RPC and verifies canonical idempotent recovery.
- **Queue backlog:** `.github/scripts/v3-s11-backlog-drain-rehearsal.sh` creates a bounded backlog through governed `jury.closed` operations, drains through canonical S4/Jury consumer contracts, and samples ordinary reads concurrently.
- **Unavailable dependency:** `.github/scripts/v3-s11-unavailable-dependency-rehearsal.sh` starts a real loopback HTTP dependency, claims a real `jury.tasks` delivery, stops the dependency, proves the health request actually fails, records `DEPENDENCY_FAILURE` through the canonical S4 failure contract, restores the same endpoint, retries, and verifies exactly one immutable consumer receipt.

All six remain `rehearsal_ready` until isolated local runs are retained against the exact candidate SHA. A shell script existing in Git is evidence of implementation, not evidence that the universe actually executed it.

## Unavailable-dependency rehearsal

Run only on disposable local Supabase:

```bash
V3_S11_DEPENDENCY_SHA=$(git rev-parse HEAD) \
V3_S11_DEPENDENCY_OUTPUT=./artifacts/v3-s11-unavailable-dependency.json \
bash .github/scripts/v3-s11-unavailable-dependency-rehearsal.sh
```

The rehearsal:

1. verifies the supplied SHA equals the checked-out commit and requires a clean worktree;
2. obtains Supabase configuration from the local CLI and refuses non-loopback API/database targets;
3. refuses to start if unrelated actionable `jury.tasks` work exists in the disposable local database;
4. creates a draft edition/show and emits the fixture event through the governed `studio2_apply_jury_voting_status` R2 operation, never by direct outbox insertion;
5. starts a real HTTP server bound to `127.0.0.1` and verifies it is reachable;
6. claims the fixture delivery through `studio2_claim_domain_event_deliveries`;
7. stops the HTTP dependency and requires a real failed TCP/HTTP health request;
8. records the observed outage through `studio2_fail_domain_event_delivery` with `DEPENDENCY_FAILURE`, zero retry delay and bounded attempts;
9. verifies no consumer receipt exists while the dependency is unavailable;
10. restores the same dependency endpoint, reclaims the delivery and executes `studio2_process_jury_domain_event`;
11. verifies exactly one immutable consumer receipt, one canonical DomainEvent, completed outbox state, exactly two claims, and retained dependency-failure evidence;
12. optionally writes a non-certifying exact-SHA JSON artifact.

The script deliberately leaves immutable event/receipt ledger rows in the disposable local database. Reset local Supabase after retaining evidence.

## Stale projection / retry rehearsal

```bash
bash .github/scripts/v3-s11-stale-projection-rehearsal.sh
```

It hard-refuses hosted database targets, corrupts only the derived Organizer Task projection, preserves canonical scheduler truth, makes the first projection write fail, then retries and verifies semantic single-row convergence. The fixture is transaction-scoped and rolled back.

## Lost response / transport-failure rehearsal

```bash
bash .github/scripts/v3-s11-lost-response-rehearsal.sh
```

The script uses the real `studio2_apply_jury_voting_status` R2 RPC. `scripts/v3-drop-upstream-response-proxy.mjs` forwards only to loopback Supabase, fully consumes upstream success, and destroys the downstream socket. Before retry, the rehearsal proves the operation receipt, Jury state/version and `jury.closed` event committed exactly once. Exact retry must return the durable original result without advancing state again.

## Bounded backlog-drain rehearsal

The backlog rehearsal has no invented load number or latency threshold. Supply an explicit load shape and provenance:

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

Allowed sources: `production-telemetry`, `contest-participation-or-audience`, `provider-constraint`, `historical-peak`, `approved-forecast`, `explicit-rehearsal-plan`, or `exploratory`.

The script refuses hosted targets and unrelated actionable Jury work, creates backlog only through governed R2 operations, drains in bounded canonical consumer batches, records read latency/error observations, and emits `thresholds: null` plus `certificationClaim: false` rather than manufacturing a passing capacity threshold.

## Generate static exact-SHA coverage evidence

```bash
V3_FAILURE_COVERAGE_SHA=$(git rev-parse HEAD) \
V3_FAILURE_COVERAGE_ENVIRONMENT=repository-static \
V3_FAILURE_COVERAGE_OUTPUT=./artifacts/v3-failure-injection-coverage.json \
npx tsx scripts/generate-v3-failure-injection-coverage.ts
```

The generator is offline. It binds evidence to the clean checked-out SHA, creates requested output directories recursively, and makes no certification claim.

`V3_FAILURE_COVERAGE_REQUIRE_ALL_REHEARSED=1` is reserved for deliberate release-evidence review.

## Remaining S11 evidence work

The implementation inventory is intentionally not declared certified:

1. execute each `rehearsal_ready` path on isolated local infrastructure at the exact candidate SHA;
2. retain the backlog and unavailable-dependency JSON artifacts plus command/runtime evidence;
3. promote individual scenarios to `rehearsed` only after objective run evidence exists;
4. feed the retained evidence into the wider S11/full-service and final S16 release evidence review.

Implementation coverage is now complete for the registry’s eight required failure classes, but release evidence is not. Those are different nouns for a reason.
