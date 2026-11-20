# V3 S10 SLO and alert evidence

## Purpose

S10 is complete only when critical SLIs are measured, initial SLOs are reviewed and documented, alert thresholds are functional, the error-budget view is usable, and zero-tolerance correctness signals remain clean. The existing S10 instrumentation and policy code provides those mechanics. This evidence layer binds their reviewed output to one exact candidate SHA.

This is a **component evidence** contract. `ready_for_qa_review` does not mean Solaris Studio is release-certified. Final S16 certification remains a separate QA/integration decision.

## Safety boundary

The generator is deliberately offline. It reads one JSON file and writes one JSON assessment. It does not generate production traffic, query Supabase, call Cloudflare, or discover telemetry itself.

**Never point automated S10 evidence generation at hosted Supabase.** Automated collection/rehearsal must remain local or isolated. Any production-observation evidence used for final review must come from already-approved, privacy-safe, bounded operational telemetry rather than a crawler, load test, browser matrix, or repeated synthetic traffic against production.

## Exact-SHA input

Run the generator only after choosing the candidate SHA:

```sh
V3_S10_EXPECTED_SHA="$CANDIDATE_SHA" \
V3_S10_REQUIRE_REVIEW_READY=1 \
  bun scripts/generate-v3-s10-slo-evidence.ts \
  evidence/s10-input.json \
  evidence/s10-slo-evidence.json
```

The assessment fails closed when the input or measured baseline belongs to another SHA.

## Required evidence groups

The input must contain:

1. **Measured baseline**
   - exact candidate SHA;
   - non-empty operation sample;
   - operation success ratio;
   - consequence p95 lag;
   - actionable delivery age;
   - dead-letter and expired-lease counts;
   - uncertain-operation and processing-age measurements.

2. **Reviewed initial objectives**
   - every canonical `V3_SLO_SCOPES` scope exactly once;
   - canonical Class A/Class B starter targets where specified;
   - evidence-backed targets for evidence-defined scopes;
   - canonical initial p95 latency goals;
   - explicit reviewer, time, rationale and production-observation reference.

3. **Functional critical-alert proof**
   - critical submission error-rate spike;
   - result publication mismatch;
   - database unavailable;
   - authentication failure spike;
   - production egress anomaly;
   - notification queue unable to drain during a deadline.

   Each proof must identify the condition/threshold, the test evidence and the time it was tested. A configured alert with no functional test does not satisfy the gate.

4. **Error-budget dashboard evidence**
   - all canonical scopes visible;
   - current budget state visible;
   - current alert state visible;
   - reviewed reference retained.

5. **Current scope health and correctness**
   - every canonical scope has a current reviewed `healthy` evaluation;
   - duplicate committed official operations = 0;
   - silently lost successful operations = 0;
   - wrong-edition official mutations = 0;
   - no unresolved S10 issue remains.

## Status meanings

- `invalid`: evidence is malformed, mixed-SHA, contradictory, or makes a forbidden production/certification claim.
- `measurement_incomplete`: the measured SLI baseline is missing required values.
- `review_incomplete`: reviewed scope/latency/dashboard evidence is incomplete or not production-observation-backed.
- `alert_incomplete`: one or more canonical critical alerts lack functional proof.
- `blocked`: evidence is complete enough to assess, but a scope is unhealthy, correctness is non-zero, or another unresolved issue remains.
- `ready_for_qa_review`: the S10 component evidence is complete enough for QA to consume. It is still not release certification.

## S16 handoff

Retain the generated JSON artifact with its source-run provenance. QA/S16 may then bind its digest and exact successful source-run metadata into the `system-hardening` envelope alongside S11, S12 and S13. If the candidate SHA changes, regenerate the affected S10 evidence. Human civilization has already invented enough ways to accidentally certify yesterday's build.
