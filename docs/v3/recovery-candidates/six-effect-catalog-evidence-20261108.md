# Solaris V3: six previously uncertain migration effects
**Evidence date:** 2026-11-08
**Target:** Solaris Studio hosted PostgreSQL 17, project `dkxmnvekiopyesuzggeu`
**Method:** bounded, manual, read-only `pg_catalog` function-signature,
role-execute, trigger and relation existence checks. No application rows, no
users, no configuration secrets, no DDL/DML, no migrations executed.

This is a dependency/effect classification of the six entries still marked
`effect-uncertain` in the preceding recovery matrix. It is not an end-to-end
equivalence audit, a production smoke test or permission to push SQL.

| Historical source migration | Classification | Hosted read-only evidence |
| --- | --- | --- |
| `20261019112300_v3_s14_transition_http409.sql` | **effect-missing** | Exact `public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)` function absent; `studio2_process_edition_domain_event(uuid,text,text)` absent; name-level catalog scan found no alternate overload for either |
| `20261019112900_v3_s13_migration_registration_context.sql` | **effect-missing** | `private.v3_migration_contracts` relation absent; `public.v3_register_migration_contract(text,integer,text,boolean,text,text)` function absent, with no alternate name-level overload |
| `20261019113300_v3_s13_strict_registration_restore.sql` | **effect-missing** | Registration function and S13 contract registry absent; therefore the strict registration-restoration behavior is not installed |
| `20261021161000_v3_s14_task_reconciliation_service_boundary.sql` | **effect-partial** | `private.studio2_reconcile_all_organizer_tasks(uuid)` exists, definition MD5 `756db08b6994b189992bd527f97c4b37`, but `service_role` has **no EXECUTE** on that signature; `authenticated` also has no EXECUTE |
| `20261021202000_v3_s14_archive_reconciliation_convergence.sql` | **effect-partial** | Aggregate task reconciler exists, but its inspected definition contains neither `v3_archive_task_reconciliation_gates` nor `v3_reconcile_resolved_task_notifications`; the archive-gates relation and the exact archive/notification reconciliation functions are absent |
| `20261023205400_v3_s13_adopt_batch_running_order_result_sync.sql` | **effect-missing** | S13 contract registry absent; `participants_sync_running_order_results` statement trigger absent; `sync_results_after_participant_running_order_change` function absent; `admin_set_show_running_order(uuid,uuid[])` exists in older, non-set-based form. Legacy `participants_sync_results` trigger still exists |

## Scope and remaining blockers

These catalog facts distinguish absent effects from partial compatibility.
They do not prove that a proposed upgrade will work with current hosted
data or that all dependencies, privileges and object definitions match the
full source migration chain. In particular, an existing aggregate task
reconciler is **not** proof of Archive convergence; a missing S13 registry
is **not** permission to manufacture migration-history entries.

The source branch is not ready for production: 28 effects classified missing,
8 partial; the 32 newer repository migrations remain pending in the dated
frontier snapshot. Source migration counts must be regenerated on the exact
release candidate, including any post-snapshot additions.

Required next engineering step: build a sanitized hosted-head-equivalent
**disposable local** fixture, reconcile the other documented S14 catalog
differences (including two hosted-only direct-write guard triggers and
notification-delivery grants), and rehearse a dependency-ordered, forward-only
System-owned repair. Preserve hosted-only guard behavior until reviewed.
No CI/browser traffic may contact production Supabase.

**Safety:** This evidence does not authorize hosted migration, migration-history
repair, production deploy, feature activation or change of maintenance mode.
