# 20 November 2026 S13–S16 observed hosted baseline

**READ-ONLY CATALOG EVIDENCE, NOT A PRODUCTION MIGRATION OR RESTORE CERTIFICATE.**

This snapshot was captured from project `dkxmnvekiopyesuzggeu` using current main `f17a015e52c1e3f6e48ebcc07844f1633aa3fba8`. The source repository's approved catalog SQL was reduced to one bounded SELECT per statement because the linked SQL interface reports only the final result, without executing the embedded transaction wrappers. **The observed session setting `transaction_read_only=off` is recorded truthfully; the SELECT statements themselves performed no writes.** Existing private contest data, private backup bytes, voting rows and raw function definitions were not retrieved.

- Hosted: **497** migration rows, tip `20261101181812`.
- Source SQL identities absent from hosted history: **281 pre/bootstrap legacy** (excluded from current frontier), **36 post-bootstrap pre-tip gaps**, **59 after-tip pending**. Filename absence alone is not proof of missing SQL effects. No ledger repair or indiscriminate `supabase db push`.
- S13/S14 scoped objects: **4/11 tables**, **4/20 functions**, **0/2 indexes**, **2/11 triggers**, **31/31 compatible columns**.
- Downstream voting/publication 15-object profile: **unchanged** from the November 13 stored reference, as checked by canonical sorted JSON.
- Since November 13, the differences in the scoped catalog are: `tables:public.editions`, `tables:public.notification_deliveries`. Those are to be attributed to independently audited security hotfixes, not silently accepted as restored equivalence.
- Backup restoration of Storage object bytes, Auth/Vault/provider configuration and all original roles/grants remains an independent release gate. Neither this snapshot nor synthetic CI proves real restoration.
- Full S13–S16 requires an approved, dependency-ordered hosted-only SHA-256 migration manifest, restored-environment acceptance and abort-safe checks. Local fixture/generator SQL must never be run against hosted production.
- The user handles final Cloudflare traffic promotion. No production migration, release-mode change, private data export, or Cloudflare traffic promotion was performed here.

Source catalog files: `docs/v3/recovery-candidates/s13-s14-catalog-export-readonly.sql` blob `a5b8d664fbf221bc947414ebc57657a557e8bb25`, `docs/v3/recovery-candidates/s13-s14-voting-dependency-inspection-readonly.sql` blob `2c366e2313f6e67a4bd3afab5dd264fc0831c0b0`. This report may be checked offline and does not need network connections or database credentials in CI.
