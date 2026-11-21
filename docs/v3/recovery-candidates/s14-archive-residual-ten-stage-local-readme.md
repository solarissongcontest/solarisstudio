# S14 Archive residual recovery (10-stage, local only)

**Status: DRAFT / NOT DEPLOYABLE / NO PRODUCTION AUTHORITY.** This is not an instruction to run SQL against the hosted Solaris Studio database and does not modify historical migration history.

The production owner-authorized recovery on 21 November 2026 already installed two of the twelve stages embedded in the older 112 kB Archive candidate:

- `20261019112200_v3_s14_final_results_readiness_hardening.sql`: `private.v3_edition_final_results_ready(uuid)` plus `v3.s14.final-results-readiness-hardening`.
- `20261021161000_v3_s14_task_reconciliation_service_boundary.sql`: system-only EXECUTE for `private.studio2_reconcile_all_organizer_tasks(uuid)` plus `v3.s14.task-reconciliation-service-boundary`.

The original local-only 12-stage recovery **must not be replayed in production**. Its earliest section installs an older, weaker Final Results helper and overwrites the exact final implementation already installed. Its original absence/semantic preflight now correctly fails.

`scripts/stage-v3-s14-archive-residual-local.mjs` deterministically reads the immutable integrated candidate and two exact historical SQL blobs (all pinned by Git blob SHA-1). It removes the two completed source stages and, crucially, the *earlier intermediate* Final Results helper inside the Archive foundation stage. Its new protected transaction checks full final-helper `prosrc`, owner, definer, schema search path, no API role EXECUTE, semantic contract, and existing service-only aggregate Task reconciler before **and after** the remaining ten stages. It preserves the original archive atomic transaction envelope, trigger/capability sequence, final convergence implementation and no-historical-ledger-repair postcheck.

Run the **source-only** static tests (no database):

```bash
node --test scripts/stage-v3-s14-archive-residual-local.test.mjs
node scripts/stage-v3-s14-archive-residual-local.mjs > /tmp/s14-residual-local.sql
```

The generated file remains local-only, even if these checks pass. It is **not** a replacement for the private-hosted-backup or owner/ACL restoration certificate and has **not yet been executed against isolated PostgreSQL**. Never run it with Supabase SQL Editor, `supabase db push`, or any hosted SQL tool merely because it exists.

## Required next isolated verification

1. In the existing **network-none PostgreSQL 17.11**, use the reviewed restored-schema owner/ACL baseline, not a synthetic blank template. Install the S13 dark foundation and the two already-present source effects *first*. Preserve strict contract registration and their exact source body.
2. Execute this ten-stage candidate in one guarded transaction. Verify real DB parsing, every final guard/trigger/grant, public-vs-service denial, immutable Results gating, terminal Archive Task convergence and source-only Televote guards under actual restored roles. No official production rows or ballots should be touched.
3. Re-run after a deliberately interrupted transaction, a partially staged installation, spoofed GUC/JWT or forged service identity, and an exact duplicate attempt. Inspect catalog and row fingerprints for rollback/no unintended writes.
4. Compare the full recovered owner/ACL/default privilege and verified 66-country lifecycle against the private backup in the operator's isolated environment. Do not substitute CI's synthetic fixtures for this.
5. Only after separate owner approval and a real production install plan, install forward-only with an exact-reviewed SHA, bounded locks, a recovery receipt and no historical ledger fabrication. Public Live, Archive transition and official voting writers remain gated until release certification.

The current 13 actionable gaps are 3 S14 Televote source-truth effects and 10 residual Archive stages. This candidate addresses **preparation and regression prevention only**, not completion of those ten effects.
