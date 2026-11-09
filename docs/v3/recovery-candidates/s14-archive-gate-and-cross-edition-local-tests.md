# S14 Archive authority and reconciliation cross-edition tests

**Status: new regression coverage only; NOT a migration, NOT production-certified.**

## Why this change

Canonical V3 Archive must remain an irreversible, server-authoritative lifecycle change. After a successful `post_edition → archived` command, current-contest tasks, their present-tense Inbox actions and pending delivery attempts must become terminal. Retained failed delivery and governance/incident evidence must remain intact.

The existing `v3-s14-archive-system-rehearsal.yml` already runs the full canonical chain on isolated Supabase, testing final Results evidence, the governed Archive command, S4 outbox consequences, replay, runtime delete guards, task notification convergence and historical failed-delivery preservation. This PR strengthens **two missing cross-scope cases**, without inventing a new parallel Archive implementation.

## New checks added to existing local-only scenarios

**`.github/scripts/v3-s14-archive-delete-guard-rehearsal.sh`**

- After a real governed Archive command, verify that the private one-shot gate row was consumed, rather than left reusable.
- In the same disposable SQL transaction, simulate a **gate for Edition A** (using the fixture owner role only). Direct SQL trying to archive **Edition B** must fail with exact SQLSTATE `42501` and the canonical command error; B's state must remain `results`.
- Simulate a **gate for Edition B with the wrong transaction identifier**. Direct Archive must fail identically and must not consume or mutate that stale gate.
- Verify anon, authenticated and service_role cannot insert into the private gate table or execute the private gate issuer function. Clean up synthetic gates and check no fixtures leaked.
- These additions operate inside the existing `BEGIN … ROLLBACK` suite. The tests are not permission for anyone to create private gates in production.

**`.github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh`**

- Create a second, **unarchived control edition** with its own open `edition.blocker` organizer task, actionable Inbox projection and pending delivery.
- Archive **only the target edition** using the real canonical RPC and run scoped task reconciliation.
- Verify the control edition's runtime, open task, actionable Inbox and pending delivery remain unchanged.
- Reconcile the archived edition **twice more** and repeat the control checks.
- Existing tests continue proving the archived edition's task is resolved, pending delivery suppressed, terminal failed delivery unchanged, incident governance still open, and impossible post-Archive work cannot resurrect.

**`src/lib/v3-s14-archive-gate-scope-and-reconciliation.contract.test.ts`** pins the new local behavioral assertions to the canonical private transaction gate, S14 task convergence implementation and two full migration-chain rehearsal jobs. CI paths are updated to cover future edits.

## Live production and release boundaries

Prior read-only catalog observation showed `public.studio2_edition_runtime` present, while the Archive transition RPC, private one-shot and task reconciliation gate tables, gate issuer, runtime/workflow/task guards and runtime guard trigger were absent. Hosted archive SQL **has not** been executed. An isolated fully migrated local database is not the same as a hosted-head-equivalent upgrade because live hosted migration history has independent gaps.

These tests require the complete **local Supabase migration chain** and never run against hosted Supabase. The CI workflow retains isolated local Supabase start/reset, exact feature SHA checks, clean-replay and current-main-upgrade jobs, and forced stop on exit.

**NO-GO:** do not replay historical migrations, fabricate migration-history rows, alter real edition runtime, change feature flags or deploy Archive from this PR. Full hosted-head-equivalent parity, forward-only recovery design, security/Task/Televote coupling and owner approval remain prerequisites to production DDL.

## S05 acceptance-matrix traceability

The new regression checks above run alongside the existing real-RPC local rehearsals, rather than substituting static strings for behavioral execution:

| Negative case | Executed behavioral fixture | Canonical truth checked |
| --- | --- | --- |
| Duplicate exact Archive request | `.github/scripts/v3-s14-archive-system-rehearsal.sh` | Receipt is replayed; one domain event and unchanged legacy event count |
| Same operation with changed semantics | `v3-s14-archive-system-rehearsal.sh` | Idempotency conflict; historical result and pre-existing receipts intact |
| Reordered Archive before `post_edition` | `.github/scripts/v3-s14-archive-guard-rehearsal.sh` | `STATE_CHANGED`; results-state edition unchanged |
| Stale expected version | `v3-s14-archive-guard-rehearsal.sh` | `VERSION_CONFLICT`; no processing receipt or premature Task resolution |
| Unauthorized actor | `v3-s14-archive-guard-rehearsal.sh` | `AUTHORIZATION`; runtime and current-workflow Task unchanged |
| Wrong edition or transaction-bound one-shot gate | `.github/scripts/v3-s14-archive-delete-guard-rehearsal.sh` | Exact `42501` guard denial, no cross-edition transition or reusable capability |
| Cross-edition Task projection reconciliation | `.github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh` | Archived task terminal; independent active task, Inbox and pending delivery stay actionable; failed delivery and governance evidence retained |

`src/lib/v3-s14-archive-gate-scope-and-reconciliation.contract.test.ts` pins the matrix and workflow wiring to the canonical source. The database checks, not the string-contract assertions, are the behavioral acceptance evidence. A green run only certifies that exact candidate commit on disposable Supabase; it does not authorize hosted migration or wider V3 release.
