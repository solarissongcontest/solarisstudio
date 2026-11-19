# S14 Archive: read-only qualification of existing hosted prerequisites

Production: `dkxmnvekiopyesuzggeu`, PostgreSQL 17.11. Source SHA `15091c4aa394ccd9fd48cdecec03e5faab9d5f6c`. Captured `2026-11-19 22:16:44.625378+00`.

Original source candidate `docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql` Git blob `c866ebc8aea24891ee6648acf03c90ee192e6480` is explicitly **LOCAL REHEARSAL ONLY**. This checkpoint does **not** authorize or reclassify it as production-ready SQL.

A single read-only SELECT against the production catalog verified **16/16 core parent relations**, **29/29 current-workflow runtime relations**, **4/4 original helpers**, and **21/21 additional runtime helpers**. The **18 new Archive functions** were all absent as required. No new Archive trigger collision or private gate collision was detected. Both pre-existing task helpers are owned by postgres with `SECURITY DEFINER` (see fingerprint-only JSON evidence). The current frozen S13/S14 catalog also records **31/31 compatible column contracts**.

**Critical order:** The S13 registry table and registration RPC are still missing. The source preflight will intentionally fail until the S13 foundation is safely installed. This read-only inspection checks catalog prerequisites only: it cannot validate the source's semantic migration-contract history precondition while the S13 table is absent, and it does not prove hosted-head data/role equivalence or transaction safety.

NEXT: independently certify real November 15 backup restoration including Storage bytes and Auth/Vault/provider configuration. Freeze the *hosted-only*, dependency-qualified, checksummed S13 → S14 → Confirmation → Televote → Results → S16 forward sequence. Test actual positive/negative workflows on restored isolated data and verify original owner/grant parity. Never run local-only donor generators or `supabase db push` on production. No Cloudflare promotion.

All GitHub CI for this PR runs **offline** on committed metadata only. The SQL file here is explicitly operator-only and never invoked from CI.
