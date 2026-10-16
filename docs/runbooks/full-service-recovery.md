# Solaris V3 full-service recovery runbook

## Purpose

Coordinate database, Storage, deployment and rollout recovery when a single-layer rollback is insufficient. This is the S11 composition procedure for incidents that may affect official truth or multiple infrastructure layers.

## Trigger examples

Use full-service recovery when there is credible risk of:

- database loss/corruption,
- migration-induced canonical-data corruption,
- Storage loss inconsistent with database metadata,
- corrupted official ballots/results/publication state,
- application rollback incompatibility with the current schema,
- multi-layer failure where isolated recovery cannot establish coherent truth.

## Recovery order

1. **Declare and contain**
   - create incident identity,
   - freeze dangerous writes/promotion,
   - preserve logs, operation/correlation IDs and damaged-state evidence,
   - identify currently active edition/show/critical operational window.
2. **Choose recovery point**
   - identify database recovery point,
   - identify matching Storage/object source,
   - record code/deployment and rollout-policy state associated with the recovery point where known.
3. **Restore database in isolation**
   - follow `database-restore.md`,
   - verify schema, critical-table fingerprints, ballots/results, receipts/events/audit evidence.
4. **Recover Storage in isolation**
   - follow `storage-restore.md`,
   - compare manifests and byte/checksum evidence,
   - never treat metadata-only restoration as recovered objects.
5. **Reconcile cross-layer truth**
   - every canonical media/object reference must resolve or have a documented reconstructible/intentional state,
   - reconcile operation receipts and DomainEvent/outbox state,
   - rebuild only projections that have a proven canonical rebuild contract.
6. **Select compatible application candidate**
   - choose exact immutable SHA/deployment compatible with the recovered schema,
   - do not let an older application silently dictate a schema downgrade.
7. **Deploy isolated/recovery candidate and verify**
   - validate authentication/session security,
   - critical participant workflows,
   - jury/televote as relevant,
   - results/publication integrity,
   - Organizer system/recovery access,
   - public read paths and required media.
8. **Cut over**
   - require explicit approval based on recorded recovery evidence,
   - change traffic/runtime bindings through the normal controlled deployment path,
   - keep immediate rollback/fallback available until post-cutover verification succeeds.
9. **Post-cutover verification**
   - compare the live runtime/database/storage identities with approved recovery evidence,
   - monitor critical operations and reconciliation state,
   - investigate every unexpected divergence rather than normalizing it away.
10. **Close and learn**
    - record measured RPO/RTO achieved by the drill/incident,
    - document lost/unavailable data if any,
    - create follow-up work for every manual or ambiguous recovery dependency.

## Canonical verification checklist

Before cutover, verify at minimum:

- migration/schema head,
- active edition/show identity,
- participant/entry counts and critical content fingerprints,
- jury ballot population and validation state,
- televote ballot/aggregate state,
- result versions/totals/ranks and available hashes,
- publication state/pointers,
- membership/capability history required for current access,
- operation receipts and uncertain-operation reconciliation,
- DomainEvent/outbox dead-letter/retry state,
- audit evidence,
- Storage object manifest and privacy policy,
- exact application/runtime candidate identity.

## RPO/RTO policy

The System plan proposes near-zero RPO for irreplaceable Class 0 truth where architecture reasonably supports it, up to one hour for Class 1 operational evidence, and rebuildability for Class 2 projections. These are **proposals until provider capability and measured drills validate them**.

Likewise, do not publish an RTO from this document. Record measured recovery duration from drills and incidents, then use S10/S11 evidence to establish defensible targets.

## Rehearsal rule

Never run destructive restore drills against production. Use isolated/local infrastructure and, for provider-level Storage/deployment drills, isolated provider resources with no production traffic or credentials beyond what the rehearsal explicitly needs.

## Current certification state

- PostgreSQL restore: repository-level local rehearsal is provided by `.github/scripts/v3-s11-database-restore-rehearsal.sh`.
- Storage object-byte recovery: procedure documented, provider drill still required.
- Cloudflare deployment rollback: procedure documented, isolated provider drill still required.
- Full-service recovery: procedure documented; cannot be certified until its component restore drills and an end-to-end isolated rehearsal have passed on recorded evidence.

Documentation and one database rehearsal are **S11 foundation**, not a full S11 pass.
