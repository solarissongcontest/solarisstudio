# Solaris V3 dependency-outage recovery

## Purpose

This runbook covers the S11 failure class where a DomainEvent consumer has successfully claimed work but a required downstream service becomes unavailable before the consumer can complete its consequence.

The recovery objective is deliberately narrow:

1. preserve the canonical DomainEvent;
2. classify the real dependency failure through the shared SystemError taxonomy;
3. record the failed attempt through the canonical S4 delivery-failure contract;
4. retry only through the canonical lease/claim contract;
5. restore the dependency;
6. converge on exactly one immutable consumer receipt while retaining attempt/error history.

This runbook does **not** declare provider-level disaster recovery or full-service recovery certified. It proves one deterministic local dependency-outage path.

## Production-safety boundary

The rehearsal is intentionally isolated.

It must never use hosted Solaris Supabase or an internet dependency. The rehearsal refuses non-loopback Supabase/database targets, and the dependency probe refuses any target other than `127.0.0.1` or `localhost`.

Normal target shape:

```text
Supabase API: http://127.0.0.1:54321
Database:     local Supabase PostgreSQL
Dependency:   http://127.0.0.1:<ephemeral-port>/health
```

If local infrastructure is unavailable, fail the rehearsal. Do not substitute production.

## Rehearsal

Start a disposable local Supabase stack from the candidate checkout, then run:

```bash
bash .github/scripts/v3-s11-unavailable-dependency-rehearsal.sh
```

The rehearsal performs these steps:

1. starts a real HTTP dependency bound only to loopback;
2. verifies the dependency is healthy;
3. seeds one canonical S4 DomainEvent delivery;
4. claims the delivery through `public.studio2_claim_domain_event_deliveries`;
5. terminates the dependency process;
6. observes a real network failure and classifies it with `systemErrorCodeFromUnknown`;
7. requires that classification to be `DEPENDENCY_FAILURE`;
8. records the attempt through `public.studio2_fail_domain_event_delivery`;
9. verifies the delivery is pending, attempt history is preserved, the DomainEvent still exists, and no consumer receipt was created;
10. restores the dependency on the same endpoint;
11. reclaims the exact delivery through the canonical worker contract;
12. completes it through `public.studio2_complete_domain_event_delivery`;
13. verifies exactly one immutable consumer receipt and the preserved dependency-failure history;
14. replays completion and verifies it resolves to the same receipt without rewriting it.

## What counts as a pass

A pass requires all of the following:

- the outage was caused by stopping an actual loopback service, not by inventing an error label;
- the resulting fetch failure was classified by the production SystemError classifier as `DEPENDENCY_FAILURE`;
- the canonical S4 outbox retained `last_error_code = DEPENDENCY_FAILURE` while retry was pending;
- canonical event truth survived the failed attempt;
- no success receipt existed before the dependency recovered;
- the dependency came back on the same endpoint;
- recovery advanced the existing attempt history rather than creating replacement work;
- completion produced one immutable consumer receipt;
- the completed delivery retained its prior attempt count and `last_error_code` as recovery history;
- duplicate completion reported replay and did not create or rewrite a receipt.

## Evidence to retain

For release evidence, retain at minimum:

- exact candidate SHA;
- rehearsal stdout/stderr;
- confirmation that the local Supabase target passed the fail-closed isolation guard;
- the final PASS line;
- the relevant focused test result.

Do not promote this narrow drill into a claim that Storage, Cloudflare, PostgreSQL restore, or full-service recovery has been rehearsed. Those are separate S11 evidence tracks.

## Failure handling

If the real outage does not classify as `DEPENDENCY_FAILURE`, fix the shared classification boundary rather than hard-coding the rehearsal.

If the delivery cannot be reclaimed after dependency restoration, inspect the canonical outbox status, lease owner, lease expiry, attempt count, `last_error_code`, and consumer receipts. Do not mutate private outbox rows directly to make the test pass.

If the dependency restores but completion produces multiple receipts, treat that as a release-blocking idempotency failure.
