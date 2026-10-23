# V3 S11 database outage recovery rehearsal

## Purpose

This rehearsal closes the System V3 failure-injection gap for a **real unavailable dependency**.

It does not simulate a dependency error by writing an error code. It temporarily stops the exact PostgreSQL container backing one disposable local Supabase stack, observes a governed Solaris operation fail to return success, restores PostgreSQL, then proves the same operation identity converges exactly once after recovery.

The exercised command is the existing R1 `system.push.retry_failed` operation exposed through `admin_retry_failed_notification_delivery`.

## Safety boundary

Run only against an isolated local Supabase stack.

The script refuses:

- a non-loopback Supabase API URL;
- a non-local PostgreSQL URL;
- a container that is not named like a Supabase database container;
- zero or multiple database containers mapped to the local `DB_URL` port.

The script installs an `EXIT`, `INT` and `TERM` trap before stopping PostgreSQL so the selected local database container is restarted even if a later assertion fails.

It must never be adapted to stop or disturb hosted Solaris production infrastructure. Production Supabase is not a chaos-test target.

## Rehearsal

```bash
bash .github/scripts/v3-s11-database-outage-rehearsal.sh
```

The local Supabase stack must already be running and fully migrated. Each invocation creates fresh run-scoped actor emails, delivery identity, operation identity and idempotency key, so the rehearsal can be repeated on the same disposable local stack without colliding with its previous fixtures.

The rehearsal:

1. creates isolated local actor fixtures;
2. grants the operator the existing `system.manage` capability;
3. creates a real failed notification-delivery precondition;
4. resolves the one `supabase_db_*` container whose mapped PostgreSQL port matches `DB_URL`;
5. stops that exact container;
6. calls `admin_retry_failed_notification_delivery` with one run-scoped operation/idempotency identity;
7. requires the unavailable dependency to produce no successful command response;
8. restarts PostgreSQL and waits for both PostgreSQL and the local Data API to recover;
9. proves the outage committed neither the delivery transition nor an operation receipt;
10. retries the exact same operation identity through the governed RPC;
11. proves the delivery becomes `pending` and exactly one succeeded `system.push.retry_failed` receipt exists;
12. repeats the same request and proves idempotent replay does not create a second canonical operation.

## What this proves

The rehearsal provides executable local evidence for the canonical V3 outage contract:

- a real dependency is unavailable;
- Solaris does not fabricate success while it is unavailable;
- no partial canonical mutation survives the failed attempt;
- the dependency can be restored;
- the same operation can be retried safely;
- idempotency converges on one canonical result.

It complements the existing S11 restore and dead-letter recovery drills. It does not replace backup restore evidence, provider disaster-recovery evidence, or final exact-SHA release certification.
