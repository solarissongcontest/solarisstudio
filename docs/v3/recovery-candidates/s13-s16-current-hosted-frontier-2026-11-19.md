# November 19 S13–S16 live catalog qualification

Source: `ded80719b8626e887cbe27dde7bbc640349ccce4`; project: `dkxmnvekiopyesuzggeu`; time: `2026-11-19T21:42:55.705322+00:00`; PostgreSQL 17.11.

**Operational status:** This is a bounded live PostgreSQL metadata inspection and an OFFLINE CI baseline, NOT a database restoration certificate or approved hosted-only migration. It reads no app rows, votes, passwords, backup bytes, raw function bodies or credentials.

The two source-controlled `BEGIN READ ONLY; SELECT; ROLLBACK` introspection scripts were converted to **single SELECTs** because the connector returns only the final result of a multi-statement execution. Consequently the captured session reported `transaction_read_only=off` (as recorded), not 'on'. No write statement was executed. Source blobs: `a5b8d664fbf221bc947414ebc57657a557e8bb25`, `2c366e2313f6e67a4bd3afab5dd264fc0831c0b0`.

- S13/S14: 4/11 tables; 4/20 functions; 31/31 compatible columns; 0/2 indexes; 2/11 triggers.
- Downstream: 5/6 tables and 2/9 functions. No drift versus the November 13 source-controlled snapshot.
- Hosted ledger: 497 applied versions; tip `20261101181812`. There are 281 unpaired **legacy/prebootstrap** SQL source identities (not assessed individually here), 36 missing **post-bootstrap** source identities at/before hosted tip, 59 newer unrecorded SQL source files. **Missing history is not proof of absent database effect.**
- Compared to November 13, the **two** changed catalog rows are `public.editions`, `public.notification_deliveries`. They require explicit owner/grant mapping to the emergency ACL fixes, not a silent baseline rewrite.

Next: certify the independently restored November 15 DB+roles/Auth/Vault+Storage object **bytes**, verify every missing stage's dependencies and exact catalog, create and rehearse a **hosted-only** checksummed forward manifest, verify positive/negative governed workflows. Never run the LOCAL-ONLY donor/recovery generators against production or mass replay historical migrations. No Cloudflare promotion.

No CI workflow in this PR accesses hosted Supabase.
