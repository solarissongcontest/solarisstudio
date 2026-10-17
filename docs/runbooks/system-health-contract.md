# Solaris V3 privacy-safe System Health contract

## Purpose

`buildV3SystemHealth()` composes already-canonical reliability evidence into one bounded, aggregate-only health model for operator consumers. It does not query Supabase, write state, create alerts, or define SLO targets.

Chat 3 may render this contract in Organizer/System Health. Chat 7 owns the reliability derivation. Chat 5 retains certification authority.

## Inputs

1. A privacy-safe `V3OperationalMetricsSnapshot` from the canonical S9 metrics projection.
2. A `V3SloEvaluation` produced by the evidence-backed S10 policy evaluator.
3. Optionally, a compact S11 recovery-readiness summary containing only rebuildable/blocked projection counts, batch bound and dead-letter replay availability.

The builder requires the SLO evaluation to identify the exact same metric timestamp, window and completed-operation sample. Mismatched evidence fails closed as `invalid` rather than being visually combined.

## Output

The health contract exposes only aggregate operational data:

- overall status: `healthy`, `degraded`, `critical`, `insufficient_data`, or `invalid`;
- Operations status and aggregate completion/processing/success information;
- Consequence/outbox status and aggregate backlog/retry/dead-letter/lag information;
- Reconciliation-required state and aggregate reasons;
- recovery capability as `available`, `partial`, or `unknown`;
- critical **alert codes**, never raw error payloads;
- deduplicated operator actions from the S10 evaluator and canonical recovery rules.

It explicitly emits a privacy contract declaring that user identifiers, raw payloads and high-cardinality labels are absent.

## Intrinsic degraded states

Some states require operator attention even when a particular S10 policy does not configure a numeric alert threshold. System Health therefore degrades, but does not independently declare `critical`, when any of these aggregate facts are present:

- one or more dead-letter deliveries;
- one or more expired processing leases;
- one or more uncertain operations requiring reconciliation.

Numeric SLO policy remains authoritative for warning/critical threshold evaluation. The health composer does not invent latency, failure-rate or backlog targets.

## Recovery readiness is not runtime health

A `partial` recovery-readiness status means some declared projections still lack canonical bounded rebuild contracts. It does **not** by itself mark the running system degraded. Runtime degradation is derived from actual operational/reconciliation evidence.

This distinction prevents a known design gap from masquerading as a live incident, while still making the recovery limitation visible to operators and release QA.

## Privacy and cost

The composer is a pure in-memory transformation. It performs no network requests and creates no logs/metrics of its own. Do not feed it raw operation traces, actor IDs, request scopes, event payloads, tokens or raw error metadata.

The upstream S9 projection is responsible for bounded server-side aggregation. System Health must never become a browser loop that scans raw production tables just because humans enjoy converting dashboards into accidental load tests.
