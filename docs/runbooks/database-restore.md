# Solaris V3 database restore runbook

## Purpose

Restore PostgreSQL canonical truth after corruption, accidental deletion, failed migration, or database loss. A backup is not recovery evidence until an isolated restore has succeeded and canonical invariants have been checked.

## Safety boundary

- Never rehearse a destructive restore against production.
- Freeze dangerous production writes before any real recovery cutover.
- Preserve the damaged environment and its logs/evidence until the incident owner explicitly releases them.
- Do not claim an RPO or RTO that the active Supabase plan and observed recovery drills have not demonstrated.
- Automated rehearsal must hard-refuse non-loopback database URLs.

## Data criticality

Class 0, irreplaceable official truth: official ballots, finalized results, published rule versions, audit evidence, membership/access history.

Class 1, important reconstructible operational evidence: operation receipts, tasks, notification/delivery records.

Class 2, derived/rebuildable state: projections, indexes and analytics caches.

## Recovery procedure

1. Declare a recovery incident and record incident/correlation identity.
2. Freeze dangerous writes using the server-owned operational controls available for the incident.
3. Identify the recovery point and record its provenance. Do not assume the newest backup is automatically the correct one.
4. Restore into an isolated database/project first.
5. Validate schema/migration compatibility before accepting restored data.
6. Validate canonical truth and reconciliation evidence.
7. Reconcile Storage/external state separately. PostgreSQL restore does not restore object bytes.
8. Run smoke/invariant checks against the isolated target.
9. Cut over only after explicit release approval and retain rollback capability.
10. Verify the cutover and close the incident with evidence references.

## Required isolated verification

At minimum compare the source/recovery-point evidence and restored target for:

- migration/schema head,
- row counts and deterministic fingerprints for critical relations,
- foreign-key validation state,
- active edition/show records,
- participants and canonical entries,
- jury ballots,
- televote ballots,
- result rows and any available calculation/version hashes,
- publication pointers/state,
- `studio2_operation_receipts`,
- `private.v3_domain_events` and outbox state,
- Organizer audit evidence.

A mismatch is a failed restore until explained and approved. Never silently "repair" official truth during restore validation.

## Local rehearsal

`.github/scripts/v3-s11-database-restore-rehearsal.sh` performs the database portion against local Supabase only. It creates a temporary sentinel, produces a full custom-format dump, restores it into a new isolated local database, verifies the sentinel, compares fingerprints of critical canonical tables, compares foreign-key validation state and verifies S2/S4 recovery ledgers exist.

This proves the repository's PostgreSQL restore path, not provider backup availability and not Storage object recovery.

## Evidence to retain

- exact repository SHA,
- migration/schema head,
- backup/recovery-point identifier,
- rehearsal/incident identifier,
- source and target fingerprints,
- invariant/smoke results,
- operator/approver identity,
- start/end timestamps and measured recovery duration,
- any divergence and its disposition.
