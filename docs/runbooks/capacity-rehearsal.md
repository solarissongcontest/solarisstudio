# Solaris V3 capacity rehearsal runbook

## Purpose

Measure the behavior of Solaris under explicit synthetic load without turning a convenient local number into a production capacity promise. S12 is evidence-driven: load shape and acceptance thresholds come from measured baselines, provider limits, or an explicitly approved rehearsal plan.

## Safety boundary

- Never point the capacity harness at production or any hosted Supabase/Cloudflare endpoint.
- Use isolated/local runtime and local Supabase only.
- Do not reuse production credentials, private payloads, ballot contents, user identities or Integrity evidence in synthetic traffic.
- Do not infer provider-billed egress, CPU saturation or production database capacity from local client measurements.
- Do not publish an S12 capacity limit until provider/runtime evidence and representative rehearsal data support it.

## Canonical scenarios

The registry in `src/lib/v3-capacity-scenarios.ts` defines the required scenario families without inventing numeric load:

1. `show-start-live-refresh` — synchronized public/Live reads at show start.
2. `confirmation-deadline` — concurrent delegation Confirmation submissions/reconciliation near deadline.
3. `entry-media-deadline` — concurrent Entry/media saves/submissions and downstream review consequences.
4. `jury-deadline` — concentrated Jury save/finalize traffic with idempotency and consequence work.
5. `televote-open` — mixed voting-state reads and ballot activity when televote opens.
6. `voting-close-consequence-burst` — round close plus final writes and downstream task/projection/notification work.
7. `results-publish` — publication plus synchronized public result reads/assets.
8. `notification-fanout` — one event producing a bounded delivery fanout without resending successful recipients.
9. `organizer-control-room` — simultaneous operational read-model refresh by organizers.
10. `reconciliation-backlog-drain` — bounded recovery backlog processing while ordinary reads continue.
11. `submission-burst` — broad shared mutation envelope after domain-specific deadline cases are understood.
12. `synchronized-traffic-spike` — broad shared-runtime/API spike for cross-cutting bottlenecks.

A rehearsal may split one family into several concrete endpoints, but every chosen load shape must record why its request count, concurrency and duration were selected.

## Capacity dimensions and budget bands

The canonical System plan requires capacity reasoning across HTTP requests, database requests, Supabase egress, database rows, realtime connections, storage, media-upload bandwidth, notification sends, search volume, Cloudflare invocations and log volume. The scenario registry records which of those dimensions each rehearsal can exercise.

For every major system, eventual certification must define **normal, contest-day, peak and hard-safety-limit** budgets. The numeric values are deliberately absent from the registry: they **must come from evidence rather than guessed defaults**. A local rehearsal can inform those budgets but cannot, by itself, prove provider ceilings or a production safety limit.

## Local harness

`.github/scripts/v3-s12-local-capacity-rehearsal.mjs` requires explicit values:

- `V3_CAPACITY_URL` — loopback/local target URL only.
- `V3_CAPACITY_SCENARIO_ID` — evidence identity for the registered scenario family.
- `V3_CAPACITY_REQUESTS` — explicit total request count.
- `V3_CAPACITY_CONCURRENCY` — explicit worker concurrency.
- `V3_CAPACITY_COMMIT_SHA` — exact 40-character repository SHA for the code under rehearsal.
- `V3_CAPACITY_LOAD_SOURCE` — one of `production-telemetry`, `contest-participation-or-audience`, `provider-constraint`, `historical-peak`, `approved-forecast`, `explicit-rehearsal-plan`, or `exploratory`.
- `V3_CAPACITY_LOAD_RATIONALE` — short human-readable explanation for why this load shape was selected.
- optional `V3_CAPACITY_METHOD`, `V3_CAPACITY_HEADERS_JSON`, `V3_CAPACITY_BODY`.
- optional loopback `DB_URL` for PostgreSQL activity, lock/connection pressure and canonical DomainEvent queue/retry measurements.
- when `DB_URL` is present, `V3_CAPACITY_DB_SAMPLE_MS` is required so mid-run pressure is sampled at an explicit interval rather than hidden behind a magic default.
- optional `V3_CAPACITY_OUTPUT` for the JSON report.

The harness has **no default request count, concurrency, duration target or pass/fail latency threshold**.

Example against an already running local worker/API:

```bash
V3_CAPACITY_URL=http://127.0.0.1:4173/api/health \
V3_CAPACITY_SCENARIO_ID=show-start-live-refresh \
V3_CAPACITY_REQUESTS=<explicit-rehearsal-count> \
V3_CAPACITY_CONCURRENCY=<explicit-rehearsal-concurrency> \
V3_CAPACITY_COMMIT_SHA=$(git rev-parse HEAD) \
V3_CAPACITY_LOAD_SOURCE=<documented-source> \
V3_CAPACITY_LOAD_RATIONALE='<why-this-load-shape>' \
DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
V3_CAPACITY_DB_SAMPLE_MS=<explicit-sampling-interval> \
node .github/scripts/v3-s12-local-capacity-rehearsal.mjs
```

Replace the placeholders only from an explicit rehearsal plan or measured baseline. They are intentionally not examples with magic numbers.

## Required measurements

Each representative scenario must retain:

- achieved request throughput,
- p95 latency,
- p99 latency,
- error rate and status distribution,
- relevant database activity deltas,
- local connection and active-connection peaks where a local database is attached,
- local lock-wait and ungranted-lock peaks,
- observed client response bytes,
- capacity-harness process memory before/after and peak observed during requests,
- DomainEvent/outbox queue depth before/after and peak observed where applicable,
- retry/dead-letter pressure before/after and peak observed where applicable.

The local harness additionally records p50/max latency and transaction/block/tuple activity when a local `DB_URL` is provided.

### Measurement caveats

`observedResponseBytes` is the byte count received by the local HTTP client. It is **not provider-billed egress** and must not be presented as such.

PostgreSQL transaction/block/tuple counters and sampled lock/connection evidence are useful local activity evidence. They are **not provider CPU, I/O-credit, connection-pool-saturation or managed-database saturation metrics**. Sampling reduces the chance of missing a short peak but does not magically turn local PostgreSQL evidence into managed-provider telemetry. Provider/runtime observability must supplement it before production capacity is certified.

`clientMemory` is the Node capacity-harness process only. It can detect harness-side response-buffer growth and gross local memory behavior, but it is not browser memory, server memory, Supabase compute memory or Cloudflare memory.

Queue depth and retry pressure are measured from the canonical S4 outbox when local database access is provided. Retry pressure includes deliveries with `attempt_count > 1`, total-attempt movement, maximum attempts and dead-letter movement. A scenario that exercises another queue must add that queue's canonical measurement explicitly rather than silently treating S4 as universal.

The database sampling interval itself can affect a small local rehearsal. Record it with the evidence and avoid sampling so aggressively that the observer becomes the load generator. Humans did eventually invent a way to benchmark the benchmark, naturally.

## Scenario-specific interpretation

Not every metric is equally diagnostic in every scenario:

- **Confirmation / Entry / Jury deadlines:** prioritize successful write throughput, p95/p99, database transaction/lock behavior, idempotent retry behavior and outbox backlog growth.
- **Televote open:** prioritize write latency/error rate, connection pressure and duplicate/replay safety under bursty eligible traffic.
- **Voting close:** prioritize lock/state-transition behavior and the rate at which downstream queue depth returns toward baseline.
- **Results publication / show start:** prioritize read fan-out latency, response bytes, database read activity and application/runtime memory evidence.
- **Notification fanout:** prioritize queue growth/drain rate, retry pressure and dead-letter behavior; successful recipients must not be re-enqueued merely because another recipient failed.
- **Organizer Control Room:** prioritize bounded aggregate/read-model query behavior and repeated-refresh pressure rather than full-table client fetches.
- **Reconciliation backlog drain:** prioritize queue/backlog reduction, retry pressure, ordinary-workload latency impact and bounded batch behavior.

## How to establish a defensible load shape

Use one or more of:

- measured production/session traffic from existing privacy-safe telemetry,
- known contest participation/audience counts,
- provider quotas and connection/runtime ceilings,
- historical peak traffic,
- an approved forecast with a documented safety factor,
- an explicit rehearsal plan for exploratory work.

Record the source and rationale with the run. If none exists, the rehearsal is exploratory only and cannot certify a production capacity claim.

Solaris has a bounded contest scale. Rehearsals should model realistic synchronized behavior and sensible safety margin, not fictional internet-scale traffic that teaches nothing except how quickly a laptop fan can become emotionally involved.

## Pass/fail policy

The harness returns measurements, not an invented SLO. For a certification rehearsal, compare the report against S10/S12 thresholds established separately from measured baselines. Fail on any required invariant or threshold breach and retain the raw report.

For smoke-style local runs, `V3_CAPACITY_REQUIRE_ALL_SUCCESS=1` can fail the process on any HTTP/transport error. That is a correctness switch, not a latency/capacity target.

## Evidence to retain

- exact repository SHA and runtime build identity,
- scenario ID and endpoint/workflow mapping,
- source and rationale for request count/concurrency/duration,
- local database sampling interval when attached,
- local runtime/database versions,
- start/end timestamps,
- complete JSON report,
- relevant server/database/provider metrics,
- any queue/backlog after the run,
- threshold/baseline reference used for evaluation,
- result and follow-up actions.

## Current certification state

This local harness and registry are **S12 foundation only**. They prove that Solaris has a reproducible, production-isolated measurement mechanism and a canonical scenario inventory with explicit load-shape provenance and capacity-dimension coverage. S12 remains uncertified until representative scenarios are executed with defensible load shapes, provider/runtime evidence is included, normal/contest-day/peak/hard-safety-limit budgets are derived from evidence, bottlenecks are addressed, and the resulting capacity assumptions are documented from actual measurements.
