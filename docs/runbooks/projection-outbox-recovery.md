# V3 bounded projection and outbox recovery

Status: **S11 operational recovery guardrail / rehearsal support**. This document does not certify recovery.

## Purpose

Use this procedure when canonical state is intact but a derived projection, operation reconciliation, or one domain-event consumer delivery is stale or failed.

The recovery rule is deliberately narrow:

1. diagnose the exact failed derived object or event delivery;
2. choose a recovery path already declared by the canonical System registry;
3. recover the smallest safe scope;
4. verify against canonical truth;
5. stop and escalate when no canonical rebuild/replay contract exists.

Do **not** repair canonical workflow truth with ad-hoc `UPDATE`, `DELETE`, manual receipt creation, copied event rows, or browser writes.

## Machine-readable preflight

Generate the current recovery-readiness report from the repository with an exact code identity and environment label:

```sh
V3_RECOVERY_EVIDENCE_SHA=$(git rev-parse HEAD) \
V3_RECOVERY_EVIDENCE_ENVIRONMENT=repository-static \
V3_RECOVERY_EVIDENCE_OUTPUT=./artifacts/v3-recovery-readiness.json \
npx tsx scripts/generate-v3-recovery-readiness.ts
```

The generator is offline and registry-derived. It refuses a missing/non-exact SHA and a missing environment label. The generated artifact records the exact SHA, environment, generation timestamp and command alongside the readiness report.

The report distinguishes:

- projection contracts that are currently rebuildable and bounded;
- projection contracts that are still foundation/declared and therefore blocked from automated recovery;
- the canonical one-delivery dead-letter replay path;
- the maximum recovery batch size.

A blocked report item is evidence that a canonical recovery contract is missing. It is **not** permission to improvise a database mutation.

## Projection recovery

Use `planV3ProjectionRecovery()` or `planV3ProjectionRecoveryBatch()` from `src/lib/v3-recovery-guardrails.ts` before execution.

A projection rebuild is permitted only when the canonical reconciliation registry proves all of the following:

- repair state is `rebuildable` or `verified`;
- a server-side rebuild path exists;
- a verification path exists;
- the repair has an explicit non-global scope;
- the required edition/show/actor/operation scope is supplied as a valid UUID.

The planner normalizes each plan to the one scope identifier required by its canonical contract and drops irrelevant scope fields. The planner refuses global recovery. Batch planning is capped at 25 independently scoped items, rejects duplicate normalized targets and fails closed when any item lacks a safe canonical path.

Current examples already supported by the canonical registry include:

- Organizer task reconstruction, bounded to one edition per invocation;
- operation/receipt reconciliation, bounded to one operation per invocation.

Projection families that remain `foundation` must stay blocked until Chat 1 adds the canonical rebuild/reconciliation contract and evidence.

## Dead-letter recovery

The canonical S4 outbox provides:

`public.studio2_requeue_dead_letter_domain_event(event_id, consumer_key, reset_attempts)`

Use `planV3DeadLetterReplay()` first. The guardrail requires one valid event UUID and one valid consumer key and always limits the recovery plan to one delivery.

Default `resetAttempts` is `false`. Preserving attempt history is safer during ordinary recovery and makes repeated poison-event behavior visible. Reset attempts only when the incident analysis explicitly justifies it.

The requeue RPC is service-role-only and changes downstream delivery state, not canonical domain state.

After requeue:

1. verify that the exact `(event_id, consumer_key)` delivery returns to `pending`;
2. allow the normal consumer worker to claim it through the canonical lease path;
3. verify one successful completion;
4. verify exactly one immutable consumer receipt exists for that event/consumer pair;
5. verify the downstream projection/task/notification consequence against current canonical state;
6. verify the item does not immediately return to dead-letter.

If the same event fails again, stop blind replay. Treat it as a poison-event or consumer defect and investigate the consumer/error class.

## Duplicate delivery / lost response

Do not create replacement events when a response is lost.

For operation uncertainty, reconcile the existing operation/receipt through the canonical operation reconciliation path. For event delivery uncertainty, rely on the immutable consumer receipt and idempotent delivery semantics. A duplicate delivery must converge on the existing receipt rather than duplicate the consequence.

## Foundation-only projections

If `buildV3RecoveryReadinessReport()` lists a projection under `blockedProjections`, recovery is intentionally unavailable through this runbook.

Required next step:

1. identify the canonical source of truth;
2. define the smallest rebuild scope;
3. define the deterministic rebuild path;
4. define a verification query/contract;
5. define bounds and retry behavior;
6. request the missing canonical contract from Chat 1;
7. add isolated rehearsal evidence before marking the projection rebuildable.

Do not turn the runbook into a shadow schema migration.

## Production safety

Recovery rehearsals, failure injection and capacity tests must use local or otherwise isolated test infrastructure. They must never generate machine-driven traffic against the hosted Solaris Studio production Supabase project.

Production recovery actions are deliberate operator actions during an incident, scoped to the exact affected object/event, and should be performed only after the incident scope and canonical recovery path are understood.

## Evidence for Chat 5

For each recovery rehearsal, record:

- exact repository SHA;
- environment (`local` / isolated test environment);
- recovery kind;
- exact bounded scope;
- canonical recovery path;
- pre-recovery state;
- post-recovery state;
- verification result;
- duplicate/retry behavior observed;
- elapsed recovery time;
- remaining blocked contracts;
- exact commands/tests used.

The readiness artifact itself should be retained with the test/rehearsal artifacts rather than regenerated later from a different commit.

Chat 5 owns release certification. A passing local rehearsal is evidence, not certification.
