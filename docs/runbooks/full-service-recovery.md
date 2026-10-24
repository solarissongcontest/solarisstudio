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

## Machine-readable composition evidence

Full-service recovery is assessed by `src/lib/v3-full-service-recovery-evidence.ts`.

The manifest must bind all recovery evidence to one exact candidate SHA and contain exactly one ready-for-QA component assessment for each of:

- database restore,
- Storage object-byte recovery,
- deployment rollback.

Each component entry embeds the component assessor's real JSON output under `assessment` instead of translating it into another quasi-authoritative schema. The wrapper adds only composition provenance: `component`, `observedAt`, the retained assessment `artifactPath`, and its `artifactSha256`. The composer requires each embedded assessment's `expectedCommitSha` and `evidenceCommitSha` to equal the full-service candidate, its `errors` array to be empty, and its anti-certification boundary to remain intact. Deployment evidence must additionally retain `fullServiceRecoveryClaim: false`.

`artifactPath` is repository-root-relative and must identify the retained JSON assessment that is embedded in the manifest. The generator reads that file, recomputes its SHA-256, and canonical-JSON-compares the retained assessment with the embedded `assessment`. A digest-shaped string is not provenance. A missing file, digest mismatch, invalid JSON, or embedded/file mismatch makes the composed evidence invalid. The strict `--require-ready` gate also requires `artifactProvenanceVerified: true`.

Those component references are not enough by themselves. The same manifest must also retain one isolated end-to-end rehearsal that binds the exact component rehearsal identities and proves every cross-layer check:

- database/Storage identity consistency,
- recovered schema/application compatibility,
- canonical integrity,
- publication integrity,
- authentication and authorization,
- critical participant flows,
- reconciliation health,
- Storage privacy,
- exact runtime candidate identity,
- post-cutover verification.

The composed rehearsal must remain explicitly isolated. Evidence is invalid if it claims production was touched, production Supabase received rehearsal traffic, a destructive production restore occurred, or provider/production RPO or RTO was established by the isolated drill.

Generate the deterministic assessment without network access:

```bash
bun scripts/generate-v3-full-service-recovery-evidence.ts \
  --input docs/evidence/v3-s11/full-service-manifest.json \
  --expected-sha "$CANDIDATE_SHA" \
  --output docs/evidence/v3-s11/full-service-assessment.json \
  --require-ready
```

`--require-ready` fails closed unless every component is present on the exact SHA, every retained assessment artifact is content-verified, every cross-layer check passed, and there are no unresolved rehearsal issues.

A `ready_for_qa_review` assessment still carries `certificationClaim: false` and `qaReviewRequired: true`. It is an S11 System evidence input, not final S16 release certification.

## RPO/RTO policy

The System plan proposes near-zero RPO for irreplaceable Class 0 truth where architecture reasonably supports it, up to one hour for Class 1 operational evidence, and rebuildability for Class 2 projections. These are **proposals until provider capability and measured drills validate them**.

Likewise, do not publish an RTO from this document. Record measured recovery duration from drills and incidents, then use S10/S11 evidence to establish defensible targets.

The full-service manifest records measured **isolated rehearsal** RPO/RTO separately and explicitly rejects provider/production RPO/RTO claims.

## Rehearsal rule

Never run destructive restore drills against production. Use isolated/local infrastructure and, for provider-level Storage/deployment drills, isolated provider resources with no production traffic or credentials beyond what the rehearsal explicitly needs.

Automated testing must not connect to hosted production Supabase. Missing local/component evidence is a failed rehearsal prerequisite, never permission to fall back to production.

## Current certification state

- PostgreSQL restore: repository-level local rehearsal exists; exact-SHA retained evidence is being converged separately.
- Storage object-byte recovery: isolated component rehearsal/evidence is separately owned and must be current-main verified.
- Cloudflare deployment rollback: isolated provider component rehearsal/evidence is separately owned and must be current-main verified.
- Full-service recovery composition: the fail-closed exact-SHA evidence contract and generator exist; an actual end-to-end isolated rehearsal still has to consume current, accepted component evidence and pass every cross-layer check.

The composition contract prevents missing component evidence from being silently reinterpreted as an S11 pass. S11 remains incomplete until the component drills and the end-to-end isolated rehearsal produce accepted evidence.