# Solaris V3 dependency-outage recovery

## Purpose

This runbook covers the S11 failure class where a canonical DomainEvent consumer has claimed work but a required downstream dependency becomes unavailable before the consumer can complete its consequence.

The deterministic rehearsal uses the real `jury.tasks` consequence path created by a governed `jury.closed` operation. The dependency itself is an isolated loopback HTTP process so the outage is real without turning production into a chaos-testing hobby.

The recovery objective is narrow:

1. preserve the canonical Jury operation and DomainEvent;
2. observe an actual dependency request failure;
3. classify that failure through the production `systemErrorCodeFromUnknown` taxonomy;
4. record the failed delivery through the canonical S4 failure boundary;
5. restore the same dependency endpoint;
6. reclaim the same `jury.tasks` delivery;
7. run `studio2_process_jury_domain_event`;
8. converge on exactly one immutable consumer receipt while retaining attempt/error history.

This is failure-injection evidence, not provider-level disaster recovery or full-service recovery certification.

## Production-safety boundary

The rehearsal must never use hosted Solaris Supabase or an internet dependency.

It fails closed unless:

- the Supabase API is `127.0.0.1` or `localhost`;
- PostgreSQL is loopback/local;
- the dependency fixture binds only to `127.0.0.1`;
- the dependency probe accepts only `http:` loopback URLs;
- redirects are disabled, so a permitted loopback URL cannot bounce the probe to another host;
- the supplied evidence SHA exactly equals `git rev-parse HEAD`;
- the worktree is clean, including untracked files.

If local infrastructure is unavailable, the rehearsal fails. Production is not a fallback.

## Exact-SHA rehearsal

Start disposable local Supabase from the candidate checkout, then run:

```bash
V3_S11_DEPENDENCY_SHA="$(git rev-parse HEAD)" \
V3_S11_DEPENDENCY_OUTPUT="./artifacts/v3-s11-unavailable-dependency.json" \
bash .github/scripts/v3-s11-unavailable-dependency-rehearsal.sh
```

The output path is optional. If supplied, it receives a machine-readable local evidence record with `certificationClaim: false`.

## Rehearsal sequence

The script:

1. verifies local Supabase and exact clean checkout identity;
2. refuses to start if unrelated actionable `jury.tasks` work already exists;
3. bundles the shared production SystemError classifier for **Node** and executes the probe with the same Node fetch behavior covered by the focused test;
4. starts a real HTTP dependency on a loopback-only ephemeral port;
5. creates an isolated draft edition and show;
6. executes the governed `studio2_apply_jury_voting_status` operation to produce a real `jury.closed` DomainEvent and `jury.tasks` delivery;
7. claims that delivery through `studio2_claim_domain_event_deliveries`;
8. terminates the HTTP dependency process;
9. performs the actual request and requires `systemErrorCodeFromUnknown` to classify the refusal as `DEPENDENCY_FAILURE`;
10. persists that observed code through `studio2_fail_domain_event_delivery`;
11. proves canonical event truth remains, no success receipt exists, and the retry state retains attempt/error evidence;
12. restores the dependency on the **same port**;
13. reclaims the exact delivery;
14. invokes the real `studio2_process_jury_domain_event` consumer;
15. requires the receipt effect to be `jury-task-reconciliation`;
16. verifies the completed delivery retains `attempt_count = 2` and the prior `DEPENDENCY_FAILURE` as historical failure evidence;
17. invokes the consumer again and proves replay returns the same immutable receipt without rewriting it.

The completion contract intentionally retains `last_error_code`. Successful recovery does not erase the fact that the previous attempt failed.

## What counts as a pass

A pass requires all of the following:

- an actual loopback dependency process was stopped;
- the failure came from a real request, not a supplied test label;
- the production SystemError classifier returned `DEPENDENCY_FAILURE`;
- no redirect could escape the validated loopback boundary;
- the affected work is a real `jury.tasks` consequence from a governed Jury operation;
- the failed attempt used the canonical S4 failure API;
- the same dependency endpoint was restored;
- the same delivery was reclaimed;
- the real Jury consequence processor ran;
- exactly one immutable consumer receipt exists;
- the receipt proves `jury-task-reconciliation`;
- replay is idempotent;
- prior attempt/error history remains visible;
- no hosted or production traffic occurred.

## Evidence semantics

A successful local run may move the implementation state from “partial” to “rehearsal ready”. It does **not** by itself mean “rehearsed” for a release candidate until the QA/release lane retains and validates the exact-SHA artifact.

The JSON artifact records:

- exact commit SHA;
- local-only environment;
- canonical event/consumer identity;
- observed dependency failure code;
- same-endpoint restoration;
- preserved attempt/error history;
- immutable receipt count;
- replay verification;
- `productionTrafficRequired: false`;
- `certificationClaim: false`.

Do not infer Storage recovery, PostgreSQL restore, Cloudflare rollback, full-service recovery, provider RPO/RTO, or final S16 certification from this drill.

## Failure handling

If the real Node-runtime request does not classify as `DEPENDENCY_FAILURE`, fix the shared classification boundary or the runtime contract. Do not hard-code the expected label into the rehearsal.

If the restored delivery cannot be reclaimed or the real Jury consumer cannot complete, inspect the canonical outbox lease/status/attempt history and consumer receipts. Do not mutate private outbox rows directly to make the test green.

If replay produces a second or changed receipt, treat that as a release-blocking idempotency failure.
