# Solaris V3 migration hardening runbook

## Purpose

System V3 migrations follow one controlled doctrine:

`expand → backfill → dual-compatible → switch → validate → contract`

The database is authoritative for migration compatibility state, bounded backfill progress, rollback classification and cutover parity evidence. A successful `supabase migration up` is necessary but is not proof that a data migration is safe to cut over.

This runbook is an S13 foundation. It does not authorize production migration work by itself and it does not weaken the permanent rule that automated rehearsals use isolated/local Supabase only.

## 1. Register the migration contract before data work

Every non-trivial migration gets one stable `migration_key` through `v3_register_migration_contract(...)` with:

- the schema version it belongs to,
- rollback mode: `reversible` or `forward_fix_only`,
- whether it is destructive,
- an optional stable `backfill_key`,
- a short reason explaining the operational decision.

Re-registering the same semantic contract is an idempotent replay. Reusing a key with different semantics is a hard conflict.

`forward_fix_only` means operators must repair forward after the migration is in use. It is not permission to improvise reverse DDL or restore older data over newer canonical writes.

## 2. Expand additively

Prefer additive schema changes that old code can tolerate: nullable/new columns, new tables, new RPCs, compatible indexes and dual-read/write support. Do not contract or rename away the old path in the same step that introduces its replacement.

Set the migration to `expand` before moving into data work. A new schema version and a new migration identity must both begin at `expand`. Compatibility phases cannot be skipped or moved backwards.

## 3. Backfill in bounded resumable batches

`v3_claim_backfill(...)` is service-only and requires a registered migration contract that names the same `backfill_key`.

Each claim has:

- an explicit definition version,
- an explicit batch size between 1 and 1000,
- a stable worker identity,
- a lease between 5 and 3600 seconds,
- an optional expected canonical row count.

There is deliberately no unbounded `UPDATE ... WHERE ...` backfill primitive in S13. The worker owns the domain-specific query. S13 owns the checkpoint/lease contract around it.

After each batch, call `v3_checkpoint_backfill(...)` with the next deterministic cursor and processed/error deltas. A checkpoint always releases the lease so another worker/run can resume later. The processed delta cannot exceed the claimed batch size. If an expected count is known, the framework refuses overshoot and refuses `done=true` until the expected count is reached.

If a batch fails after the worker knows the durable cursor has not advanced, call `v3_fail_backfill(...)`. The failed state retains the last checkpoint and can be claimed again later. Do not advance the cursor for work whose canonical write outcome is uncertain.

## 4. Keep a dual-compatible period

After the bounded backfill is complete, advance compatibility state to `dual-compatible` while old and new paths remain valid. Compare reads/writes from both paths where the domain permits it. Keep old clients inside the declared compatibility window until evidence supports retiring them.

`v3_schema_compatibility(clientVersion)` is the browser-safe projection. It returns one of:

- `compatible`,
- `upgrade_required`,
- `server_upgrade_required`,
- `unknown` when the client does not identify a schema version.

A caller older than `minClientSchemaVersion` receives a controlled update requirement instead of undefined behavior.

## 5. Validate parity before cutover

Use `v3_record_migration_parity(...)` only after any contract-declared backfill is `completed`. The parity record must use the exact backfill key from the migration contract.

A parity run passes only when all are true:

- `expected_count = actual_count`,
- `missing_count = 0`,
- `duplicate_count = 0`,
- `critical_query_failures = 0`.

Record enough bounded `details` to identify the validation method, not private contest payloads. A failed parity run is evidence, not something to delete or overwrite.

The database refuses `switch`, `validate` and `contract` unless the latest parity evidence for that migration passes.

## 6. Switch, validate, then contract

Advance one phase at a time. After `switch`, validate critical reads/writes and reconciliation evidence before moving to `validate`. Do not contract the old representation until the compatibility window is deliberately retired.

In the current schema-version model, `contract` requires `minClientSchemaVersion = maxClientSchemaVersion = currentSchemaVersion`. That makes retirement of incompatible clients explicit rather than accidental.

Critical workflow kill switches remain domain-owned feature/operations controls. Use the existing governed workflow controls to stop dangerous traffic before a migration emergency; S13 compatibility state is not a substitute for a workflow kill switch.

## 7. Rehearsal and production safety

Before production application:

1. replay the complete migration chain on isolated/local Supabase,
2. rehearse an upgrade from the exact current `main` schema,
3. exercise resume after a checkpoint and lease contention,
4. prove invalid/oversized batches fail closed,
5. record intentionally failing parity and prove cutover is blocked,
6. record passing parity and prove ordered phase progression,
7. document whether rollback is truly reversible or forward-fix-only.

Automation must never point this rehearsal at hosted Supabase. The S13 workflow hard-copies only the S13 feature migration into a disposable current-main worktree; it does not replace or delete newer current-main migrations.

For production, use a separately approved manual change procedure with backups/recovery evidence, explicit operator ownership, and measured rollback/forward-fix criteria. A local rehearsal is not production approval.

## 8. Evidence required to call S13 complete

This foundation is not full S13 certification. Completion still requires real V3 migrations/backfills to use the framework, realistic isolated migration rehearsals for destructive/non-trivial changes, compatibility evidence across old/new clients where applicable, and release certification that the migration gate passes on the exact candidate.
