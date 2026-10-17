# Solaris V3 S12 capacity evidence review

## Purpose

Turn one raw local S12 rehearsal report into a bounded, machine-readable completeness assessment for QA. This layer **does not certify production capacity** and does not invent request counts, concurrency, SLO targets, error budgets or provider limits.

The canonical scenario inventory and local load harness remain in `src/lib/v3-capacity-scenarios.ts` and `.github/scripts/v3-s12-local-capacity-rehearsal.mjs`.

## Safety boundary

- Never run the capacity harness against production or any hosted Supabase/Cloudflare endpoint.
- The evidence generator performs no network requests. It reads local JSON files only.
- Do not put user identities, ballots, notification bodies, secrets, tokens or private contest payloads into the evidence context.
- External/runtime evidence should be referenced by stable evidence identifiers or artifact references, not copied as giant provider logs.
- `ready_for_qa_review` is deliberately not a release or certification verdict. Chat 5 / release certification retains that authority.

## Inputs

### 1. Local rehearsal report

Generate this with the merged S12 local harness. The evidence assessor requires:

- report schema version 3;
- a registered canonical scenario ID;
- exact 40-character source SHA;
- explicit load-shape source and rationale;
- loopback/local target only;
- explicit request count and concurrency;
- positive duration and coherent start/end timestamps;
- non-negative, ordered p50/p95/p99/max latency measurements;
- non-negative integer success/HTTP-error/transport-error counters whose total equals the requested request count;
- an error ratio that agrees with those counters;
- an explicit positive database sampling interval whenever database activity is attached;
- no embedded thresholds;
- every measurement required by the scenario registry.

A representative S12 rehearsal is incomplete when database activity is absent because the registry requires database activity, lock contention, connection pressure, queue depth and retry pressure.

### 2. Evidence context

The context JSON has this shape:

```json
{
  "expectedCommitSha": "<exact-40-character-sha>",
  "dimensionEvidence": [
    {
      "dimension": "supabase-egress",
      "sourceType": "provider-constraint",
      "observedAt": "<ISO timestamp>",
      "reference": "<artifact-or-provider-evidence-reference>",
      "notes": "<what this evidence establishes>"
    }
  ],
  "budgets": [
    {
      "dimension": "supabase-egress",
      "band": "normal",
      "limit": "<positive numeric value>",
      "unit": "<single stable unit for this dimension>",
      "evidenceRef": "<matching evidence reference>",
      "rationale": "<why this value is justified by evidence>"
    }
  ]
}
```

Accepted external/runtime evidence source types are `provider-constraint`, `production-telemetry`, `historical-peak`, `approved-forecast` and `runtime-observation`.

Every capacity dimension used by the chosen scenario must have external/runtime evidence before the assessment can become `ready_for_qa_review`. Every scenario dimension must also have all four canonical budget bands: `normal`, `contest-day`, `peak`, and `hard-safety-limit`.

A budget's `evidenceRef` must reference a declared evidence record for that same capacity dimension. This prevents, for example, a database-row budget from borrowing an unrelated egress-limit citation merely because both happen to contain numbers. Within one dimension, all four bands must use the same unit and limits must be nondecreasing from normal through hard safety limit. The assessor supplies no default values.

## Generate an assessment

```bash
npx tsx scripts/generate-v3-capacity-evidence.ts \
  --report ./artifacts/confirmation-deadline-capacity.json \
  --context ./artifacts/confirmation-deadline-evidence-context.json \
  --output ./artifacts/confirmation-deadline-capacity-assessment.json
```

For a certification pipeline or deliberate rehearsal gate, set:

```bash
V3_CAPACITY_REQUIRE_REVIEW_READY=1 npx tsx scripts/generate-v3-capacity-evidence.ts ...
```

The command exits non-zero for structurally invalid evidence. With `V3_CAPACITY_REQUIRE_REVIEW_READY=1`, it also exits non-zero when measurements/evidence/budgets are incomplete.

## Assessment states

- `invalid` — identity, safety, structure or evidence semantics are contradictory.
- `measurement_incomplete` — the local rehearsal omitted one or more scenario-required measurements.
- `evidence_incomplete` — local measurements are complete, but external/runtime evidence or budget bands are missing.
- `ready_for_qa_review` — required measurements and evidence inputs are complete enough for Chat 5 to review. It is **not** a certification claim.

The output always carries `certificationClaim: false` and `qaReviewRequired: true` so downstream tooling cannot accidentally reinterpret evidence completeness as release approval.

## Evidence retention

Retain together:

- exact source SHA;
- raw local harness report;
- evidence-context JSON;
- external/runtime evidence artifacts referenced by the context;
- generated assessment;
- S10 target/error-budget reference if and when those targets are separately approved;
- Chat 5 certification result.

This keeps capacity evidence reproducible while avoiding the deeply human tradition of converting one pleasant laptop benchmark into a production promise.
