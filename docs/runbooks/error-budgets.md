# Solaris V3 S10 error budgets

## Purpose

Account for evidence-backed operation-success error budgets without inventing SLO targets. The evaluator is a pure offline calculation and does not query production, emit telemetry, or certify release readiness.

A target enters this contract only through an explicit `V3OperationSuccessObjective` with measured evidence identity, rationale, exact SHA, window and sample count. There are no default percentages.

## Current indicator

The first supported indicator is `successful_operation_ratio`:

- denominator: completed canonical operations in the observation window;
- good operations: completed operations with canonical `succeeded` outcome;
- bad operations: every completed operation that is not succeeded, including failed or uncertain outcomes;
- allowed bad ratio: `1 - targetSuccessRatio`;
- burn rate: observed bad ratio divided by allowed bad ratio.

This is intentionally the indicator supported by existing measured operation counts. Latency error budgets require request-level or threshold-exceedance counts and must not be reverse-engineered from a p95 alone.

## Scope inventory

The evaluator uses fixed low-cardinality scope identifiers only:

- `system`;
- `confirmation_submission`;
- `entry_mutation`;
- `media_review_consequence`;
- `jury_submission`;
- `televote_submission`;
- `voting_round_transition`;
- `results_lifecycle`;
- `publication`;
- `notification_consequence`;
- `projection_reconciliation`.

Today the system-wide scope can consume the S9/S10 aggregate snapshot. Workflow scopes require the bounded workflow-class SLI aggregation requested from Chat 1; do not fake those observations by client-side filtering raw operation rows.

## Evaluation states

- `within_budget` — sample floor is met and observed bad operations do not exceed the target allowance;
- `exhausted` — sample floor is met and observed bad operations exceed the allowance;
- `insufficient_data` — observation has fewer completed operations than the objective's evidence-backed sample floor;
- `invalid_objective` — target/evidence is malformed or unsupported;
- `invalid_observation` — observation identity or counters are malformed.

A 100% target is supported as a zero-error budget. When a nonzero error occurs, burn-rate style ratios that would require infinity are returned as `null`; the status still becomes `exhausted`.

## Offline evidence generation

```bash
npx tsx scripts/generate-v3-error-budget.ts \
  --objective ./artifacts/system-operation-success-objective.json \
  --observation ./artifacts/system-operation-success-observation.json \
  --output ./artifacts/system-operation-error-budget.json
```

Set `V3_ERROR_BUDGET_REQUIRE_WITHIN=1` only in a deliberate rehearsal/review gate. It exits nonzero for exhausted, insufficient or invalid evidence. This is not wired into broad CI by Chat 7.

## What this does not do

- no invented target percentages;
- no production alert thresholds;
- no latency error budget from percentile-only evidence;
- no per-user/delegation/operation labels;
- no direct database reads;
- no release certification.

The result always carries `certificationClaim: false`. Chat 5 remains the certification authority. Alerts should be added only after target and burn-rate policy are reviewed against measured Solaris workloads, lest the monitoring system become a very expensive digital smoke alarm next to a toaster.
