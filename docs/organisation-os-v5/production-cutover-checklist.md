# Organisation OS V5 production cutover checklist

This checklist exists because the Organizer frontend currently depends on database capabilities that production may not yet have. A frontend deployment must never get ahead of the production database again.

## Hard safety rule

Automated tests, CI, Playwright, browser audits, migration rehearsals and preview builds MUST NOT use production Supabase. All automated validation must use an isolated local Supabase stack. Production access during this cutover is limited to deliberate operator actions and small read-only verification queries.

## Current production baseline

Production migration history was last verified at:

- `20261002184144_fix_confirmation_round_reopen_and_editing`

The production database did not yet expose the V5 Organizer Tasks, System Operations or safe Jury window operation contract at that point.

## Ordered database cutover

Apply repository migrations in timestamp order after the production baseline. Do not cherry-pick only the RPC that happens to satisfy the visible error. Later migrations depend on earlier task, operation, permission and recovery foundations.

Required chain starts with:

1. `20261002193000_organisation_os_v5_system_diagnostics.sql`
2. `20261002194500_organisation_os_v5_push_queue_leasing.sql`
3. `20261002200000_organisation_os_v5_community_moderation.sql`
4. `20261002203000_organisation_os_v5_operation_contract.sql`
5. `20261002211500_organisation_os_v5_task_engine.sql`
6. `20261002234500_organisation_os_v5_task_sources.sql`
7. `20261002235000_organisation_os_v5_confirmation_requirements.sql`
8. `20261003001000_organisation_os_v5_task_truth_expansion.sql`
9. `20261003003000_organisation_os_v5_task_notifications.sql`
10. `20261003004500_organisation_os_v5_permission_commands.sql`
11. `20261003012000_organisation_os_v5_permission_operations.sql`
12. `20261003014000_organisation_os_v5_jury_window_operations.sql`
13. Continue every later V5 migration in repository timestamp order through the current branch, including review hardening, system-job recovery, upload safety, platform modes, selection-review transitions, incident/jury lifecycle, read-only enforcement and confirmation-sync recovery.
14. Apply `20261004194000_restore_public_rls_runtime_privileges.sql` when reached in timestamp order.
15. Apply `20261004221500_runtime_release_contract.sql` only after its required V5 RPCs/tables exist.
16. Apply `20261004222500_push_delivery_receipts.sql` before treating System Operations receipt diagnostics as supported.

Do not reorder these migrations just to make a single page green.

## Pre-deploy release contract

Before exposing the matching frontend, verify the database contract returns all required Organizer capabilities as true:

- Organizer Tasks: `admin_organizer_tasks(uuid,text)`, `admin_organizer_task_count(uuid)`, and `studio2_organizer_tasks`
- System Operations: `admin_system_runtime_health(integer)`, safe retry operation contract, delivery table, and receipt-stage columns
- Jury control: `studio2_jury_window_change_preview(uuid,text)`, `studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)`, and `studio2_jury_window_versions`

The UI intentionally fails closed when this contract is missing or incomplete.

## Confirmation reconciliation

After the application code is deployed:

- participant Confirmation saves reconcile to canonical Solaris automatically;
- a failed post-commit projection records recovery evidence instead of silently disappearing;
- reconciliation must not overwrite canonical entries owned outside Confirmations;
- reconciliation must not reverse a newer final canonical participation decision.

Existing stale rows need a deliberate one-time reconciliation review. Do not mass-update every mismatch. Examples found during read-only production diagnosis included:

- Oland: accepted National Final winner has a video in Confirmations while the canonical SSC22 entry has no video. This is a safe stale-projection candidate because canonical lifecycle and Confirmation lifecycle agree.
- Onyra: accepted National Final winner has a video while the canonical SSC22 entry is still pending. Reconcile only through the canonical sync path, not direct SQL.
- Aethelgardia: canonical SSC22 state is newer and withdrawn while the old Confirmation says participating. The lifecycle guard must block automatic reversal.

## Verification after cutover

Use bounded read-only production checks only. Verify:

- runtime contract reports ready capabilities;
- Organizer Tasks loads without RPC/schema errors;
- task metrics never show reassuring zeroes when task evaluation failed;
- System Operations loads protected health data;
- jury preview/apply path opens and closes a test window only when an organizer explicitly performs that real operation;
- Oland readiness reflects canonical media after deliberate reconciliation;
- failed Confirmation reconciliation produces an Organizer recovery task after the recovery migration is active.

Do not use automated browser crawls against production for any of these checks.

## Rollback / stop conditions

Stop the cutover if any migration fails, the runtime contract is partially true, a permission boundary changes unexpectedly, or Supabase traffic spikes. Do not deploy the dependent frontend until the database is coherent.
