# Solaris V3 deployment rollback runbook

## Purpose

Return the Cloudflare-hosted Solaris application to a known-good application/runtime candidate after a defective deployment while preserving authoritative database truth and avoiding unsafe schema downgrades.

## Core rule

Application rollback and database rollback are separate decisions. Re-deploying older code does **not** authorize reversing migrations or restoring older data. The rollback candidate must be compatible with the current database schema head, or recovery must use the database/full-service procedure instead.

Cloudflare Worker rollback changes the active Worker version. It does not roll back state held by connected storage resources. Treat that separation as a safety property, not as permission to ignore data compatibility.

## Preconditions for a real Solaris production rollback

Record before action:

- incident identifier,
- currently deployed candidate SHA/deployment reference,
- intended rollback SHA/deployment reference,
- current database migration/schema head,
- current rollout/feature-policy revision,
- known compatibility evidence between rollback code and current schema,
- reason for rollback and affected critical workflows.

If candidate identity or schema compatibility is unknown, stop and move to full-service recovery rather than guessing.

## Production procedure

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

## Isolated Cloudflare provider rehearsal

Repository component rehearsal:

```bash
export SOLARIS_S11_ROLLBACK_WORKER='solaris-s11-rollback-drill'
export SOLARIS_S11_ROLLBACK_OPERATOR='qa-operator-label'
export CLOUDFLARE_ACCOUNT_ID='...'
export CLOUDFLARE_API_TOKEN='...'
export SOLARIS_S11_ROLLBACK_EVIDENCE_PATH='/tmp/v3-s11-cloudflare-rollback.json'

bash .github/scripts/v3-s11-cloudflare-rollback-rehearsal.sh
```

Use a **dedicated non-production Worker** whose name begins with `solaris-s11-rollback-`. Never point this rehearsal at the production Worker `studio`.

The rehearsal intentionally uses a tiny generated Worker fixture rather than deploying the Solaris application. The fixture contains only Cloudflare's `CF_VERSION_METADATA` binding and no Supabase, R2, KV, D1, Queue, Durable Object or other Solaris data binding.

Wrangler is pinned to `4.141.0`. The rehearsal runs it from a temporary directory and strips Solaris Supabase environment variables before every provider command, so repository `.env` state cannot become an accidental Worker binding or test dependency.

### Rehearsal sequence

The script performs this provider-level sequence:

1. resolve the exact clean repository SHA;
2. generate one rehearsal UUID and immutable version tags;
3. deploy a `known-good` Worker version;
4. read the baseline version ID from Wrangler structured output;
5. verify the live Worker reports that exact ID through `CF_VERSION_METADATA`;
6. upload a distinct `defective` version returning HTTP 503;
7. deploy that defective version at 100% traffic;
8. verify both the live runtime and `wrangler deployments list --json` show the defective version;
9. execute `wrangler rollback <known-good-version-id>`;
10. verify the newest Cloudflare deployment contains exactly one version at 100% traffic and that it is the known-good version;
11. wait until the live Worker again reports the known-good marker and exact baseline version ID;
12. retain SHA-256 digests of provider command/deployment artifacts plus exact-SHA evidence for QA review.

The evidence is assessed by `src/lib/v3-deployment-rollback-evidence.ts`.

### What the isolated rehearsal proves

It proves that the Cloudflare provider path can:

- retain a known-good immutable Worker version,
- make a defective version active,
- roll back to an explicitly selected previous version,
- replace the defective deployment with a single known-good version at 100% traffic,
- expose runtime version identity that agrees with the provider deployment record,
- measure the isolated provider rollback/convergence duration.

### What it deliberately does **not** prove

The component rehearsal does not claim:

- production Solaris RTO or RPO,
- compatibility of an arbitrary historical Solaris build with the current production schema,
- database restore,
- Storage object recovery,
- full-service recovery,
- final V3 release certification.

Those claims require their own evidence and, for full-service recovery, composition of the database, Storage and deployment recovery paths.

## Production rollback verification

A production deployment rollback is successful only when:

- the runtime reports the intended immutable candidate/deployment,
- canonical database schema remains the intended current/recovered head,
- critical commands return definitive authoritative outcomes,
- S2 operation receipt reconciliation works,
- public and Organizer critical reads are coherent,
- no unresolved critical integrity incident remains hidden behind the rollback.

## Current certification state

The repository now defines an executable **isolated Cloudflare provider rollback component rehearsal** and a fail-closed evidence contract.

Do **not** mark S11 deployment rollback certified merely because the code exists. The component reaches QA-review evidence only after the rehearsal is actually run against a dedicated non-production Cloudflare Worker on the exact candidate SHA and the retained evidence passes review.

Full S11 recovery certification remains separate and still requires the database/Storage components, combined full-service recovery evidence, production-specific compatibility review and any provider RPO/RTO evidence required by the release gate.

## Evidence to retain

For production incidents retain:

- before/after candidate SHA and deployment reference,
- schema head,
- rollout-policy revision,
- smoke/invariant results,
- operation IDs/correlation IDs for recovery tests where applicable,
- measured rollback duration,
- operator/approver record,
- incident/post-incident references.

For the isolated component rehearsal retain the generated evidence JSON and the provider artifacts whose SHA-256 digests it records. Never commit Cloudflare tokens or other provider secrets.
