# Solaris V3 deployment rollback runbook

## Purpose

Return the Cloudflare-hosted Solaris application to a known-good application/runtime candidate after a defective deployment while preserving authoritative database truth and avoiding unsafe schema downgrades.

## Core rule

Application rollback and database rollback are separate decisions. Re-deploying older code does **not** authorize reversing migrations or restoring older data. The rollback candidate must be compatible with the current database schema head, or recovery must use the database/full-service procedure instead.

## Preconditions

Record before action:

- incident identifier,
- currently deployed candidate SHA/deployment reference,
- intended rollback SHA/deployment reference,
- current database migration/schema head,
- current rollout/feature-policy revision,
- known compatibility evidence between rollback code and current schema,
- reason for rollback and affected critical workflows.

If candidate identity or schema compatibility is unknown, stop and move to full-service recovery rather than guessing.

## Procedure

1. Declare incident and freeze promotion/rollout changes.
2. If needed, move affected V3 workflows to the safest available server-owned rollout/fallback state without bypassing canonical writes.
3. Confirm the previous candidate is immutable/identifiable and compatible with the current database schema.
4. Build/obtain the exact known-good artifact from the recorded SHA. Do not substitute an unverified local working tree.
5. Deploy/restore that candidate through the normal Cloudflare deployment path.
6. Verify runtime candidate identity and environment after deployment.
7. Run critical smoke checks for authentication, Confirmation/Entry, voting surfaces relevant to the operational window, receipts/reconciliation and public read paths.
8. Verify no wrong-edition or duplicate canonical mutations occurred during the incident window.
9. Keep the defective deployment evidence available for diagnosis.
10. Re-enable rollout only through the normal promotion/evidence path.

## Fail-closed conditions

Do not perform an application-only rollback when:

- the previous candidate cannot operate against the current schema,
- a migration corrupted canonical data,
- storage/object state is inconsistent with database truth,
- official ballots/results may be lost or corrupted,
- the incident requires recovery to an earlier data recovery point.

Those cases require database/full-service recovery.

## Verification

A deployment rollback is successful only when:

- the runtime reports the intended immutable candidate/deployment,
- canonical database schema remains the intended current/recovered head,
- critical commands return definitive authoritative outcomes,
- S2 operation receipt reconciliation works,
- public and Organizer critical reads are coherent,
- no unresolved critical integrity incident remains hidden behind the rollback.

## Current certification state

This runbook documents the rollback contract, but the repository does not currently contain an isolated Cloudflare provider rollback drill bound to exact deployment identity. Do not mark S11 deployment rollback certified from documentation alone.

## Evidence to retain

- before/after candidate SHA and deployment reference,
- schema head,
- rollout-policy revision,
- smoke/invariant results,
- operation IDs/correlation IDs for recovery tests where applicable,
- measured rollback duration,
- operator/approver record,
- incident/post-incident references.
