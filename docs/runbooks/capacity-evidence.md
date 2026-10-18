# Solaris V3 S12 capacity evidence interpretation

## Purpose

Turn an isolated S12 capacity report into reviewable evidence without inventing production capacity numbers or mistaking local measurements for provider truth.

This layer is deliberately an **interpreter**, not a load generator. The merged S12 harness produces the measurements. `evaluateV3CapacityEvidence()` checks whether the rehearsal report, capacity-budget plan and cited evidence are coherent enough to compare. It never certifies release readiness.

## Capacity-budget contract

For one canonical S12 scenario, a budget plan records every capacity dimension the scenario can exercise. Each dimension must define all four System-plan bands:

- `normal`;
- `contest-day`;
- `peak`;
- `hard-safety-limit`.

Every band has an explicit numeric value, unit and one or more evidence references. Values must be non-negative and non-decreasing across the four bands. There are no default numbers.

Evidence records are intentionally low-cardinality and payload-free. Each record stores:

- evidence id;
- kind (`local_rehearsal`, `provider_constraint`, `provider_runtime_measurement`, `historical_observation`, or `approved_forecast`);
- environment;
- observation time;
- exact repository SHA the evidence was recorded against;
- rationale and source reference;
- covered capacity dimensions and budget bands.

Do not put private contest payloads, ballot data, user identity or credentials into capacity evidence.

## Report validation

The evaluator accepts the S12 harness schema only when it retains the properties that make the measurement meaningful:

- exact SHA and scenario id;
- explicit load-shape source and rationale;
- positive request/concurrency shape;
- coherent outcome counts and error ratio;
- monotonic p95/p99 relationship;
- `thresholds: null`, so the harness itself never smuggles in an SLO;
- every measurement required by the canonical scenario registry.

If a run omitted local PostgreSQL sampling, database activity, lock/connection pressure, queue depth and retry pressure remain missing. Provider evidence does not magically fill a missing local measurement.

## Comparison readiness vs release evidence

`comparison_ready` means only that:

1. the report is structurally coherent;
2. the load shape is evidence-backed rather than `exploratory`;
3. all scenario-required measurements are present;
4. all scenario capacity dimensions have all four budget bands with valid evidence links.

It does **not** mean production capacity is certified.

Provider/runtime coverage is reported separately. For every scenario dimension, eventual release evidence still needs provider constraint or provider runtime measurement coverage. Missing provider evidence appears under `releaseEvidenceGaps` but does not block a local evidence comparison.

`certificationClaim` is always `false`. Chat 5 remains the release-certification authority.

## Offline evaluation

```bash
npx tsx scripts/evaluate-v3-capacity-evidence.ts \
  --plan ./artifacts/capacity-budget-plan.json \
  --report ./artifacts/capacity-report.json \
  --output ./artifacts/capacity-evidence-evaluation.json
```

Set `V3_CAPACITY_REQUIRE_COMPARISON_READY=1` only for a deliberate local/review gate. It exits nonzero when the evidence is invalid, incomplete or exploratory. This is not wired into broad CI by the Reliability lane.

## What remains before S12 certification

The interpreter does not manufacture the evidence it is designed to check. S12 still requires representative local/isolated runs with defensible load shapes plus provider/runtime evidence for the real Solaris environment. Those runs must cover the critical synchronized scenarios and retain throughput, p95/p99, database behavior, error rate, egress evidence and queue/backlog behavior.

For production capacity, the remaining work is evidence collection and bottleneck remediation, not picking impressive numbers because a spreadsheet looked lonely.
