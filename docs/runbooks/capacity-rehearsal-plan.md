# Solaris V3 capacity rehearsal plan

## Purpose

The S12 capacity harness deliberately has no default request count, concurrency, sampling interval or latency threshold. That is a safety property: a convenient number in source control must not silently become a production-capacity claim.

This plan contract closes the gap between that rule and actually running S12. It lets a reviewer record **which evidence-backed local load shape is approved for each canonical scenario**, bind that decision to one exact candidate SHA, and validate the plan before any load generator is started.

The plan checker is static and no-network. It does **not** generate traffic, start Supabase, contact a provider, derive production budgets, or certify capacity.

## Relationship to the existing S12 layers

The layers remain deliberately separate:

1. `src/lib/v3-capacity-scenarios.ts` owns the canonical scenario inventory, required measurements, capacity dimensions and required budget bands.
2. `src/lib/v3-capacity-rehearsal-plan.ts` validates the reviewed inputs that may be used to execute those scenarios.
3. `.github/scripts/v3-s12-local-capacity-rehearsal.mjs` executes one explicitly supplied run against a loopback/local target and records measurements.
4. `src/lib/v3-capacity-evidence.ts` combines one measured report with external/provider evidence and evidence-backed budgets.
5. `src/lib/v3-capacity-portfolio.ts` requires every canonical scenario's assessment on one exact SHA before the portfolio can become ready for QA review.

A valid plan is therefore **permission to review an isolated execution**, not evidence that execution happened and not a capacity certificate.

## Required plan identity

A plan must declare:

- `schemaVersion: 1`;
- `candidateSha`: the exact 40-character repository SHA that will be exercised;
- a stable lowercase `planId`;
- `preparedAt`;
- `environment: "local-isolated"`;
- `productionTrafficAllowed: false`;
- `certificationClaim: false`;
- `qaReviewRequired: true`.

The checker also receives the expected candidate SHA separately and rejects a plan that names another commit. Copying yesterday's numbers into today's candidate therefore does not produce exact-head evidence by paperwork alone.

## Approval record

Before a plan can be ready for execution review, its `approval` object must contain:

- `status: "approved_for_isolated_rehearsal"`;
- a non-empty `reference` to the human review/decision record that approved the chosen load shapes;
- `approvedAt`, which cannot predate `preparedAt`.

The approval reference is provenance, not a substitute for provenance. Reviewers still need to inspect the referenced telemetry, audience count, provider constraint, historical peak, approved forecast, or other documented basis.

## Canonical scenario coverage

`ready_for_execution_review` requires every scenario currently registered in `V3_CAPACITY_SCENARIOS` exactly once. The validator derives this inventory from code rather than duplicating a hand-maintained list in the plan format.

Each scenario must contain at least one concrete local run. Run IDs are globally unique so retained reports can be matched back to the exact reviewed input without guessing which repeated run produced them.

A structurally valid plan that omits one or more canonical scenarios is `scenario_incomplete`, not ready.

## Per-run contract

Every run records only the information needed to reproduce the approved local load shape:

- `runId` — stable lowercase identifier;
- `targetPath` — **relative route path only**, such as a local fixture endpoint selected by the execution environment;
- `method` — `GET`, `POST`, `PUT`, `PATCH` or `DELETE`;
- `requests` — explicit evidence-backed positive integer;
- `concurrency` — explicit evidence-backed positive integer not exceeding requests;
- `databaseSampleIntervalMs` — explicit positive sampling interval;
- `loadShapeSource` — one of the sources already accepted by the canonical harness;
- `evidenceRef` — the record that supports the chosen load shape;
- `rationale` — why that evidence justifies this run;
- `fixtureProfile` — the named local fixture/data profile the execution layer must prepare.

There are intentionally **no example request counts, concurrency values or sampling intervals in this runbook**. Those values must come from the cited evidence for the actual rehearsal. Unit tests use tiny validation fixtures, but test fixtures are not operational defaults.

## What is intentionally forbidden from the plan

The plan does not accept arbitrary extra fields. In particular, do not add:

- base URLs or hosted authorities;
- request headers;
- authorization tokens;
- request bodies or ballot/participant payloads;
- Supabase project references or credentials;
- provider secrets;
- capacity thresholds or production budget values.

`targetPath` is a relative path with no authority, query string, fragment or traversal segment. The later execution layer is responsible for combining it with an independently verified loopback base URL and for constructing synthetic fixture payloads from `fixtureProfile`.

This keeps the review artifact free of credentials and private contest data and prevents a reviewed plan from quietly changing the network authority used by the harness.

## Load-shape provenance

The accepted sources match the existing local harness:

- `production-telemetry`;
- `contest-participation-or-audience`;
- `provider-constraint`;
- `historical-peak`;
- `approved-forecast`;
- `explicit-rehearsal-plan`;
- `exploratory`.

For `explicit-rehearsal-plan`, `evidenceRef` must point to a distinct supporting record. A plan cannot cite its own `planId` as proof for its numbers.

If any canonical scenario uses `exploratory`, a complete otherwise-valid plan is `exploratory_only`. Exploratory runs are useful for discovering bottlenecks, but they do not become release-ready evidence merely because the JSON is tidy.

## Validate a retained plan

```bash
CANDIDATE_SHA="$(git rev-parse HEAD)"

bun scripts/check-v3-capacity-rehearsal-plan.ts \
  --plan docs/evidence/v3-s12/rehearsal-plan.json \
  --expected-sha "$CANDIDATE_SHA" \
  --output docs/evidence/v3-s12/rehearsal-plan-assessment.json \
  --require-ready
```

`--require-ready` exits non-zero unless the assessment status is `ready_for_execution_review`. Invalid plans also exit non-zero without that flag.

The checker only reads/writes local JSON. It performs no network calls and does not start the capacity harness.

## Execution handoff

After review, an execution workflow/tool may translate each approved run into the existing harness inputs:

- compose `targetPath` with a separately verified loopback base URL;
- set the exact plan `candidateSha` as `V3_CAPACITY_COMMIT_SHA`;
- pass the plan's request count, concurrency, sampling interval, source and rationale;
- prepare only the named synthetic/local `fixtureProfile`;
- attach only a loopback local database when database measurements are required;
- retain the raw report together with the exact plan assessment and review reference.

The execution layer must still apply the harness's own loopback guards. A reviewed plan is never permission to fall back to hosted Supabase or production if the local environment is unavailable.

## Status meanings

- `invalid` — malformed, stale, unsafe, unapproved or contradictory plan.
- `scenario_incomplete` — valid reviewed structure, but not every canonical S12 scenario is represented.
- `exploratory_only` — every scenario is represented, but at least one run's load shape is explicitly exploratory.
- `ready_for_execution_review` — complete, exact-SHA, approved and non-exploratory input set. This still does **not** mean the rehearsal ran or that capacity is certified.

## Certification boundary

This plan layer always returns:

- `productionTrafficAllowed: false`;
- `certificationClaim: false`;
- `qaReviewRequired: true`.

S12 remains incomplete until representative isolated rehearsals have actually run, required measurements are retained, provider/runtime evidence is added, evidence-backed normal/contest-day/peak/hard-safety budgets are established, bottlenecks are addressed, and the exact candidate's full scenario portfolio is accepted for release review.
