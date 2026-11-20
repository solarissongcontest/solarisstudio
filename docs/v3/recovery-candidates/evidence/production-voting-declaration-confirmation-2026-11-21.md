# Production scoped S7 voting-declaration and S6 Confirmation recovery effects, 21 November 2026

**Type:** user-authorized additive SQL-function installation plus one private semantic contract. **Not** wholesale historical migration replay, a public rollout, a production lifecycle rehearsal or source-ledger history repair.

Target: Solaris Studio Supabase `dkxmnvekiopyesuzggeu`, database `postgres`, PostgreSQL 17.11; reviewed source checkout `94546072463fd9cbd3c6d8a00cd5fcaa37288f0a`.

## S7 voting-declaration expected-edition scope

Canonical immutable historical source: `supabase/migrations/20261018122500_v3_voting_declaration_expected_edition_scope.sql`; Git source blob `7fcf047292030291a1bc5f0e11d6bfb2c772c771`.

Preflight proved the existing single-edition declaration preview/apply, canonical `private.studio2_voting_declaration_edition_id(uuid)`, operation claim/complete helpers, `televoting.vote_preflight_checks`, and audit store were present; both new overloads were absent. The original legacy preview was `postgres`-owned, SECURITY DEFINER, and checked `integrity.manage` through `studio2_access_allowed`. A single bounded transaction installed two overloads as the canonical source definitions:
- `public.studio2_voting_declaration_invalidation_preview(uuid,uuid)`
- `public.studio2_apply_voting_declaration_invalidation(uuid,uuid,text,uuid,text,bigint)`

In-transaction checks matched both entire function bodies to the immutable SQL source and verified owner, SECURITY DEFINER, JSONB return, volatility and grants. An independent production postflight confirmed both `postgres` owned and SECURITY DEFINER; `anon` has **no EXECUTE**, `authenticated` and `service_role` have the source-intended EXECUTE. The existing legacy overloads were not replaced. The new apply RPC derives actual edition from canonical data, checks it against the caller-reviewed edition before operation claim or mutation, and invokes the existing capability-gated preview.

This is an accessible **authorized RPC surface** after installation, not a claim of full voting lifecycle testing or a new independent voting authority. No live declaration was invoked or altered as part of installation.

## S6 bounded Confirmation repair

Canonical immutable historical source: `supabase/migrations/20261024200300_v3_s6_confirmation_requirement_bounded_repair.sql`; Git source blob `d689f76db26d4efc796abec218e16a32784fe7e7`.

Preflight verified the prior independent Confirmation verifier, canonical per-country requirement reconciler and country resolver, existing submissions/editions/requirements stores, strict S13 contract registrar, and absence of an earlier partial repair install. One guarded transaction installed the exact original source body:
- `public.studio2_reconcile_confirmation_requirements(uuid,integer,integer)`;
- semantic `v3.s6.confirmation-requirement-bounded-repair` contract version 1.

In-transaction and independent postflight verified owner `postgres`, SECURITY DEFINER, JSONB return, **service_role-only EXECUTE** (no `anon`/`authenticated` grants), and the semantic contract seed. The function includes strict 500-candidate and 50-row page limits and delegates to the original per-country canonical reconciler; it deliberately does not reconstruct lost Confirmation generations.

**The recovery RPC was not called** against any real edition or submission in this installation. No canonical Confirmation rows were changed.

## Follow-on constraints

The live Supabase project remained `ACTIVE_HEALTHY`; the `solaris_app_v3_live` feature flag remained disabled and the prior S13 migration-writer RPC remained dark. These are effect-level observations, not a completed recovered 66-country lifecycle.

Remote migration-history records remain **497** with tip `20261101181812`; no missing historical versions were forged or marked applied. Earlier S13/HTTP409/S9/S10/Results receipts remain separate.

The S14 Televote source-truth/projection and Archive coupled gate migration must still be qualified on the recovered owner/ACL baseline and tested in isolated Postgres; the private-archive clone receipt and Auth/Vault/Storage recovery are outstanding. Do not use normal CI/Playwright against hosted production, replay all historical migrations, or enable any new official writer beyond the source-designed, scoped RPCs above.
