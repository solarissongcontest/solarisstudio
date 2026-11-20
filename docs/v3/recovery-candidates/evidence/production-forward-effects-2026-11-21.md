# Solaris V3: production forward-effect receipt, 21 November 2026 (EET)

**Status:** verified **partial effect installation**, not migration-history reconciliation, full S13–S16 certification or launch approval. This records a user-authorized narrow installation against the exact canonical Solaris Studio production database. No secrets, application rows or private backup material are included.

- Project ref: `dkxmnvekiopyesuzggeu`; database/actor: `postgres`; PostgreSQL server version number: `170011`.
- Reviewed historical SQL source checkout: `f8b8402cd839b02b50573fa66832c66cdcd12d23` (subsequent main changes did not authorize additional SQL).
- Each source effect below was checked absent immediately before execution, dependency-checked, applied in an explicit guarded transaction with 5-second lock timeout and 120-second statement timeout, and postchecked. A successful checked installation **does not make the old SQL history entry exist**.
- Source bodies, when installed, were kept unchanged. Guards and checks were additive to the operator transaction; **do not replay these scripts** or treat a missing ledger row as an absent SQL effect.
- Host project remained `ACTIVE_HEALTHY` at the subsequent bounded check. There was no Cloudflare promotion, app flag activation, official vote/result mutation, arbitrary row scan, history repair, or deployment.

| Historical source containing an effect | Observed production effect installed | Source Git blob SHA |
| --- | --- | --- |
| `20261019110000_v3_s9_safe_metrics.sql` | Three scoped time-leading indexes and `public.admin_system_observability_snapshot(integer)`, exact original body, `postgres`-owned SECURITY DEFINER; `anon` denied, `authenticated`/`service_role` callable subject to `system.read` capability check | `7b278640058ec29887a5b3abadde4f196262e222` |
| `20261019112000_v3_s10_sli_snapshot.sql` | `public.admin_system_v3_sli_snapshot(integer)` and one `v3.s10.sli-snapshot` S13 semantic contract; read-only projection of S9; same guarded system-read ACL | `59432ede1c28d8c4df5dc5fbcf40aa3562764a02` |
| `20261018053000_v3_s6_confirmation_requirement_reconciliation.sql` | Read-only bounded `public.studio2_verify_confirmation_requirements(uuid,integer)`; **service-role only**; no bulk correction of canonical requirements | `ad0c38b75c9db7a41fb184dfb0aef85e07326715` |
| `20261024170500_v3_public_published_result_snapshot.sql` | Exact-version `public.v3_public_published_result_snapshot(uuid)` plus `v3.public.published-result-snapshot` semantic contract; only selects explicitly public, version-bound, release-ready snapshots; NULL/missing-show negative check passed; `anon`/`authenticated`/`service_role` read grants as specified | `3446974a0bc04c7d52b4990d67af4463581d5c11` |
| `20261019013000_v3_public_live_rollout_flag.sql` | Feature-key CHECK allowlist expanded by **exactly** `solaris_app_v3_live`; persisted single flag row with `enabled=false`, `admins_only=false`, and empty user/edition scope arrays. Existing allowed keys unchanged | `c023976215ae942160a8737c6aceb196d38ec036` |

## Two historical ACL-only effects verified already present

These were **not newly executed**. A fresh bounded read-only privilege check against the live schema found all their exact expected effects present:

- `20261018111500_v3_confirmation_sync_service_role_privileges.sql`: all 20 source-declared `service_role` table privilege requirements across Confirmation/Solaris sync tables were satisfied; none missing.
- `20261019000500_v3_confirmation_sync_publication_event_service_role.sql`: `public.emit_entry_published_event(uuid,uuid)` exists; `service_role` can EXECUTE, while `anon` and `authenticated` cannot.

The historical ledger records for these two versions remain missing, and a bounded role-grant match does not claim all adjacent application workflows are certified. **Do not reapply an already-present permission repair.**

## Body SHA-256 and ACL verification

A separate read-only `pg_proc` query matched the installed `prosrc` SHA-256 against the exact canonical SQL dollar-quoted bodies:

- S9: `b28be9c1eeeed375cad22d747618e92ac5a6fa74ad2695d64b1be92291960489`
- S10: `f9190d555e782b1392ff1ded2c1112d025822424af8c19dca78b6aeea435a7d8`
- S6 verifier: `616b9297cbf40c1f8d10456aaee03ca51a7cd136e5b7efd2b7b2329e06a73d9b`
- Public Results snapshot: `24190b5757b4e2cb9d11f40e6642f7f9b7b34110527dbde1653bf84559ecf1fb`

All four bodies matched exactly; `postgres` ownership, SECURITY DEFINER attributes and source-intended role EXECUTE matrix matched. The independent S13 writer grant check remained false.

The initial S13 dark foundation was installed independently and previously receipt-recorded in [PR #2607](https://github.com/solarissongcontest/solarisstudio/pull/2607): five private tables, seven RPC definitions, two secondary indexes and canonical baseline contracts; six writer RPCs stayed dark. **That batch is not newly installed by this receipt.**

## Why this is not “36 migrations applied”

The production Supabase history API still reports **497 migration records** with historical tip `20261101181812`. As of this receipt the 36 missing post-bootstrap *historical identities* have **not** been fabricated or marked applied. The newer repository migration frontier is also separate.

A bounded catalog-only pass reviewed the *declared object names* of all 36 historical source files. The S13/S9/S10/Confirmation/Results/flag effects above are now present. Many later targets remain absent, including S14 Televote source truth and projection guards; S5 Entry/acknowledgement event writers; S6 notification and bounded repair functions; S14 Archive gates, runtime triggers and notification convergence; and new Results running-order synchronization. Existing function **names alone are not definition parity** and historical SQL may be partially present; source effects need complete signature/ACL/trigger/behavior and dependency reviews.

Do not run the 36 original scripts as a single bundle, call `supabase db push`, use `migration repair`, synthesize 36 empty migration rows or overwrite live contest data. The currently merged local-only S14 Archive candidate expressly disallows production use and combines 12 complex effect stages. Open PR #2404's Televote candidate also remains a separate authorizer/correctness review.

## Remaining recovery and release limitations

The private 15 November backup restored its 225 application tables, 202 RLS tables, 265 policies and 27 default ACL entries in an isolated environment, but the protected clone-specific receipt was not completed before these operator-authorized production installations. Auth/Vault/Storage and full 66-country recovered lifecycle remain unqualified. Do not imply those gates passed. Security-advisor findings on published SECURITY DEFINER read models require ordinary access-review monitoring even when grants are intentional.

**Next engineering steps:** retain effect-level evidence, refresh the historical-frontier classifier, package and test next dependency-ordered **forward-only** batches against a sanitized restored baseline, and install only independently verified stages with new exact-source receipts. No automatic public writer activation or historical history rewrites.
