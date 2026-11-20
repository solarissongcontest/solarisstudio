# S13 foundation: live catalog preflight qualified, deployment NOT approved

This checkpoint is from a bounded **single SELECT** on production project `dkxmnvekiopyesuzggeu`, at `2026-11-19 22:09:38.969265+00`, PostgreSQL 17.11, source `15091c4aa394ccd9fd48cdecec03e5faab9d5f6c`.

The exact source candidate `docs/v3/recovery-candidates/forward-only-s13-foundation.sql` has Git blob `083aa84bd6455005e9728b81a7427e0cba7b221c` and **explicitly says LOCAL REHEARSAL CANDIDATE ONLY**. This checkpoint does not change or override that restriction.

Verified live target: **14 checked planned table/function/index identities, 0 collisions**. The requisite `private.studio2_request_is_service_role()` helper is owned by `postgres`, matches a reviewed definition fingerprint `84d3f05e5f537908732a3875ba0178e6` and reviewed ACL fingerprint `341a58cafc38a872c684592babc76f83`; `service_role` has private schema USAGE. Hosted migration ledger: 497, tip `20261101181812`.

This removes the *first catalog ambiguity* for the S13 candidate. It is NOT proof of hosted-head-equivalent schema, original roles and grants recovery, Storage object-byte restoration, Auth/Vault readiness or uninterrupted application workflows. The recorded SELECT executed in the connector's default session; do not claim a transaction read-only setting was enforced. No writes were executed.

**Before converting into an approved production-forward migration:** independently restore November 15 encrypted backups including real Storage/Auth/Vault and role parity, verify 36 missing post-bootstrap historical SQL effects and 59 after-tip source files, rehearse all dependent governed Confirmation/Televote/Results/Archive paths against an isolated production-derived environment, freeze the exact hosted-only SQL bytes and per-stage rollback/stop conditions. Keep local-only stages out of the hosted manifest. Do not mark earlier historical migration versions as applied without verifying effects.

The adjacent SQL is operator-only, read-only, and MUST NOT be called by a GitHub Action. The CI validator below only reads this committed JSON and source files. Cloudflare traffic promotion remains the owner's action.
