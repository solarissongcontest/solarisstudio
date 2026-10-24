# Solaris Studio V3 S12 capacity evidence portfolio

## Purpose

S12 already has a local-only rehearsal harness and a per-scenario evidence assessment. This runbook joins those reviewed scenario assessments into one exact-SHA portfolio so the System lane can prove whether the complete canonical capacity scenario set is ready for QA review.

The portfolio is not a release certification. Chat 5 / release certification retains the final capacity gate.

## Safety boundary

This step performs no load generation and no network traffic. It only reads JSON assessment artifacts already produced from the S12 evidence pipeline.

Never use this portfolio step as a reason to point the local capacity harness at production. Capacity/load testing remains isolated/local. Production Supabase is not a capacity-test target.

## Required inputs

Provide:

1. the exact 40-character candidate commit SHA;
2. one per-scenario `V3CapacityEvidenceAssessment` JSON artifact for every scenario in `V3_CAPACITY_SCENARIOS`;
3. assessments produced for that same exact SHA.

Each per-scenario assessment remains responsible for proving its required measurements, external/runtime evidence and all four budget bands:

- `normal`
- `contest-day`
- `peak`
- `hard-safety-limit`

The portfolio does not invent missing request counts, concurrency, limits, provider ceilings or observations.

## Generate the portfolio

```bash
npx tsx scripts/generate-v3-capacity-portfolio.ts \
  <exact-commit-sha> \
  artifacts/capacity/show-start-live-refresh.assessment.json \
  artifacts/capacity/confirmation-deadline.assessment.json \
  artifacts/capacity/entry-media-deadline.assessment.json \
  artifacts/capacity/jury-deadline.assessment.json \
  artifacts/capacity/televote-open.assessment.json \
  artifacts/capacity/voting-close-consequence-burst.assessment.json \
  artifacts/capacity/results-publish.assessment.json \
  artifacts/capacity/notification-fanout.assessment.json \
  artifacts/capacity/organizer-control-room.assessment.json \
  artifacts/capacity/reconciliation-backlog-drain.assessment.json \
  artifacts/capacity/submission-burst.assessment.json \
  artifacts/capacity/synchronized-traffic-spike.assessment.json
```

To write an artifact instead of stdout:

```bash
V3_CAPACITY_PORTFOLIO_OUTPUT=artifacts/capacity/portfolio.json \
npx tsx scripts/generate-v3-capacity-portfolio.ts <exact-commit-sha> <assessment-files...>
```

For a gate that must fail until the portfolio is review-ready:

```bash
V3_CAPACITY_REQUIRE_PORTFOLIO_REVIEW_READY=1 \
npx tsx scripts/generate-v3-capacity-portfolio.ts <exact-commit-sha> <assessment-files...>
```

Exit behavior:

- `0`: structurally valid portfolio; unless the strict environment flag is set, it may still be incomplete;
- `2`: invalid portfolio;
- `3`: strict review-ready mode requested but canonical capacity evidence is still incomplete.

## Review-ready means

`ready_for_qa_review` requires all of the following:

- every canonical S12 scenario appears exactly once;
- every assessment belongs to the requested exact commit SHA;
- every scenario assessment is itself `ready_for_qa_review`;
- no measurement gaps remain;
- no required external/runtime capacity evidence gaps remain;
- no required capacity budget keys remain missing;
- no child assessment claims release certification.

A missing, duplicate, unknown or mixed-SHA scenario fails closed.

## What this still does not prove

A review-ready portfolio does not by itself prove:

- provider production ceilings;
- production capacity under real contest traffic;
- Cloudflare or Supabase plan limits beyond the referenced evidence;
- a final safe launch decision;
- the final exact-SHA release gate.

Those remain QA/release evidence responsibilities. If the candidate SHA changes, affected evidence must be regenerated rather than re-labelled.
