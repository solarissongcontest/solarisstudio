# V3 SLO baselines and actionable alerts

Status: **S10 measurement/alert foundation**. This does not certify any release SLO.

## Principle

Solaris does not get an SLO because somebody typed `99.99%` into a document.

Targets must be traceable to measured evidence from a known commit and environment. The runtime evaluator in `src/lib/v3-reliability-slo.ts` therefore refuses policies without:

- exact commit SHA;
- environment;
- observation timestamp;
- measurement window;
- positive sample count;
- rationale;
- at least one coherent threshold;
- a minimum completed-operation sample before alerts can fire.

## Measurement source

The intended metric source is the privacy-safe S9 operational snapshot over canonical operation/outbox state. Do not build S10 by querying vote payloads, user identities, raw event bodies or other sensitive/high-cardinality data.

A baseline is a measurement, not a target. Use `captureV3SliBaseline()` to store the measured values with source/environment/SHA identity. It intentionally contains no SLO thresholds.

## Target adoption

Before adopting or changing a threshold:

1. collect bounded representative baselines from local/isolated rehearsal and, where appropriate, low-cost production observation;
2. separate normal, contest-period and peak-event evidence when workloads differ materially;
3. record the exact SHA/environment/window/sample count;
4. explain why the threshold maps to user or operator impact;
5. choose warning/critical boundaries from evidence and operational tolerance;
6. review the policy after capacity or architecture changes.

Do not run synthetic load against production to manufacture a baseline.

## Supported indicators

The current policy evaluator can consume:

- successful-operation ratio;
- p95 consequence/outbox completion lag;
- oldest actionable delivery age;
- dead-letter delivery backlog;
- expired processing leases;
- uncertain operation count;
- oldest processing operation age.

These are deliberately tied to operator action. Additional workflow-specific SLIs should be added only when their canonical measurement source exists.

## Failure classification

`classifyV3ReliabilityFailure()` derives broad reliability classes from the canonical operation error taxonomy and explicit recovery context. It never inspects semantic request payloads.

Classes include authentication, authorization, validation, conflict/stale state, dependency, transient infrastructure, permanent domain failure (only when explicitly marked), reconciliation pending, operator-required recovery and unknown.

## Alert behavior

`evaluateV3SloPolicy()`:

- rejects invalid/unproven policies;
- returns `insufficient_data` below the configured sample floor;
- evaluates only metrics with configured thresholds;
- emits one highest-severity alert per configured metric;
- attaches a concrete operator action;
- does not generate an alert merely because an unconfigured metric exists.

Warnings and criticals should result in a diagnostic/recovery action, not an inbox full of decorative anxiety.

## Evidence handoff to Chat 5

For each candidate policy, hand Chat 5:

- exact candidate SHA;
- metric snapshot/baseline;
- evidence metadata;
- policy validation result;
- alert evaluation result for normal and injected-failure fixtures;
- capacity scenario that justifies peak-event thresholds where relevant;
- any currently unmeasurable workflow SLI.

Chat 5 decides whether evidence is sufficient for release certification.