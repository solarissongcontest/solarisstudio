# Solaris V3 failure-injection coverage

## Purpose

Keep S11 recovery evidence honest by distinguishing a failure that has actually been injected and recovered in isolated infrastructure from one that merely has related replay/retry primitives.

The machine-readable registry is `src/lib/v3-failure-injection-coverage.ts`. The report is evidence for Chat 5, not release certification.

## Coverage states

- `rehearsed` — retained evidence injects the requested failure condition and proves recovery/convergence.
- `partial` — related failure/recovery primitives are exercised, but the requested end-to-end failure condition is not fully injected.
- `contract_only` — canonical recovery/measurement contracts exist, but no dedicated failure-injection rehearsal proves the path.
- `missing` — no adequate canonical contract/evidence exists yet.

No state requires production traffic.

## Current foundation evidence

### Rehearsed

- **Event consumer failure:** the retained S4 DomainEvent rehearsal claims a delivery, explicitly fails it through the canonical failure RPC, proves retry/dead-letter behavior, explicitly requeues the dead letter, reclaims it and completes it.

### Partial

- **Duplicate delivery:** S4 proves semantic replay does not create a second outbox row and proves completion replay after a delivery is already complete. It does **not** inject the same event into consequence processing twice. That distinct failure remains partial.
- **Unavailable dependency:** S4 directly records the error code `DEPENDENCY_FAILURE` and proves the generic retry/dead-letter lifecycle. It does **not** make a real consumer dependency unavailable. That distinct failure remains partial.
- **Lost response after commit:** S2 proves durable committed-operation replay, but the retained foundation rehearsal does not actually discard the original workflow response after commit.
- **Transient RPC failure:** S2 proves `TIMEOUT` uncertainty and actor-scoped reconciliation, but not a real workflow transport failure around a committed operation.
- **Reconciliation retry:** bounded reconciliation contracts exist, but no retained foundation evidence deliberately fails a rebuild/verification attempt and then proves retry convergence.

### Contract-only

- **Stale projection:** S6/S11 declare bounded rebuild/verification for Organizer Tasks, but the foundation has no retained stale-derived-state injection.
- **Queue backlog:** S12 defines `reconciliation-backlog-drain` and queue/retry measurements, but the foundation has no dedicated backlog-drain injection.

## Generate exact-SHA static evidence

```bash
V3_FAILURE_COVERAGE_SHA=$(git rev-parse HEAD) \
V3_FAILURE_COVERAGE_ENVIRONMENT=repository-static \
V3_FAILURE_COVERAGE_OUTPUT=./artifacts/v3-failure-injection-coverage.json \
npx tsx scripts/generate-v3-failure-injection-coverage.ts
```

The generator is offline. Before emitting evidence it verifies:

- the supplied SHA is an exact 40-character commit SHA;
- it exactly equals `git rev-parse HEAD`;
- the index/worktree is clean, including untracked files;
- the requested output directory exists or can be created recursively.

A dirty checkout is rejected because evidence attributed to commit X must actually be produced from commit X, a concept software tooling has spent decades heroically rediscovering.

`V3_FAILURE_COVERAGE_REQUIRE_ALL_REHEARSED=1` may be used by a deliberate release-evidence review to fail when unresolved scenarios remain. Chat 7 does not wire this into broad CI; Chat 5 owns release certification and broad workflow policy.

## Next implementation layers

The stacked Reliability PRs add deterministic local tooling for stale projection/reconciliation retry, real post-commit response loss/transient RPC failure, and bounded backlog drain. Those branches keep newly implemented paths separate from retained executed evidence until exact-SHA local runs exist.

Dedicated duplicate-delivery and genuinely unavailable-dependency injections still need their requested failure conditions implemented before those scenarios can become green.
