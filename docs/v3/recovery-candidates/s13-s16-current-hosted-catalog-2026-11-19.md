# S13-S16 live catalog / migration frontier: 19 November 2026

Source: 91e2abc5020931f1de57df069e6faee695660565. Production: dkxmnvekiopyesuzggeu; PostgreSQL 17.11.
Two bounded SELECT-only catalog queries were executed in the production owner connection. The connector session itself was not marked read-only; evidence records transaction_read_only=off accurately.

Observed S13/S14: 4/11 tables, 4/20 functions, 0/2 indexes, 2/11 triggers; 31/31 inspected columns compatible.
Downstream voting/publication: 5/6 tables, 2/9 functions; unchanged from 13 November.
Hosted ledger: 497 records, tip 20261101181812. Source SQL filenames missing from ledger: 281 legacy pre-bootstrap; 36 post-bootstrap historical; 59 newer than hosted tip.
Two catalog row changes since 13 November: public.editions, public.notification_deliveries. Compare with prior emergency ACL retirement; never normalize those differences silently.

All missing-ledger entries have deployable=false. Missing ledger entries do NOT prove missing effects and must never be marked applied without source/effect reconciliation.
The existing 29-stage synthetic recovery proof includes local fixture/generator content and is NOT an approved hosted migration.
Before governed S13-S16 installation: independently verify 15 November production-derived database + object-byte + Auth/Vault + role/grant + provider restore; freeze hosted-only ordered forward SQL with checksums and per-stage guards; validate canonical positive/negative workflows on isolated restored data.
Do not execute local-only fixtures or mass db push, rewrite migration history, enable public writes, or promote Cloudflare from this evidence.
GitHub workflow only runs an offline Node validation of this saved JSON. It must never contact production Supabase.
