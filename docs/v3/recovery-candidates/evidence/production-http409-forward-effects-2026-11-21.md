# Production HTTP 409 forward-effect reconciliation, 21 November 2026

**Scope:** user-authorized targeted forward-effect installation against Solaris Studio Supabase `dkxmnvekiopyesuzggeu` (`postgres`, PG17.11). This is not historical migration-history repair, a complete S13/S14 migration sequence, a release certification or permission to activate voting/Archive writers.

## Canonical origins
- Source repository commit: `94546072463fd9cbd3c6d8a00cd5fcaa37288f0a`.
- `supabase/migrations/20261018024500_v3_entry_review_conflict_http409.sql`: one exact reviewed Entry-review function body.
- `supabase/migrations/20261018031000_v3_http409_deterministic_conflicts.sql`: exact canonical 28-signature deterministic conflict allowlist.
- Existing local-only candidate `docs/v3/recovery-candidates/forward-only-deterministic-http409.sql` in historic draft PR #2388 was consulted for narrow behavior, but **was not executed wholesale**.

## Installation proof
1. Live read-only catalog audit: all 29 target function signatures existed, were `postgres` owned and `SECURITY DEFINER`; all 29 still contained the old `'40001'` marker, none contained `'PT409'`; DomainEvent worker serialization retry still uses `40001`.
2. Before mutating Entry review, source-body equivalence was proven: the entire live function body matched the canonical source with PT409 replaced by 40001, except **two semantically equivalent SQLSTATE RAISE spellings** (`raise exception using errcode` vs `raise sqlstate`). No other body differences existed. A single guarded transaction installed the exact canonical Entry-review body, verifying owner, ACL, config, definer, volatility, return type and strictness did not drift.
3. A second guarded one-transaction operation applied only the canonical 28-signature allowlist. It required all 28 still old-only, expected owner/definer, exact database/version, and original worker semantics. For each function it replaced literal `'40001'` with `'PT409'` in its existing definition and verified the **entire `prosrc` body** differed only by that replacement. It verified function identity, owner, ACL, search_path/config, security mode, volatility, strictness, parallel setting, return and parameter types. Any unexpected drift raised an exception, rolling back the entire transaction.
4. Independent live read-only postflight: **29/29** targeted RPCs present and PT409-only, **0** old 40001 markers in the targets, **0** unexpected non-postgres/non-definer functions, and unchanged genuine DomainEvent worker serialization handling.
5. Production project subsequently reported `ACTIVE_HEALTHY`.

**No official contests, votes, results, submissions, tasks, or application user records were mutated by these DDL-only transactions.** The existing `supabase_migrations.schema_migrations` ledger remains at **497 entries** with tip `20261101181812`; there is no claim that the two historical migration identities were inserted. The recovery receipt records SQL effects only.

## Remaining scope and caveats
- The exact-current S14 Archive **preflight block** from `docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql` was separately executed inside an explicit `READ ONLY` PostgreSQL transaction and passed. **The 112 kB local-only Archive candidate itself was not installed.** Production installation remains unqualified until isolated-recovery and critical contest-state verification.
- S6 Notification and S14 Televote source-truth/guards/Archive lifecycle, Results running-order synchronization, and other outstanding post-cutover effects remain uninstalled or only partly present.
- The private 15 November recovered-archive clone receipt and full Auth/Vault/Storage platform recovery certification remain open. A local synthetic CI success is not a recovered 66-country contest pass.
- Review pending source changes before any next forward-only installation; never blindly replay all 36 historic sources, forge history entries, or enable official writer access.
