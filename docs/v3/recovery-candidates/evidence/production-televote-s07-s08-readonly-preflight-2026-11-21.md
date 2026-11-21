# S07/S08 Televote source-truth adoption: bounded live-catalog preflight (21 Nov 2026)

**Read-only inspection only. NO SQL effects installed; no official vote records or accepted ballots read/exported individually.** Project `dkxmnvekiopyesuzggeu`; PostgreSQL 17.11; repo source current at inspection `7e8dfcc328934dc656258e1b8d98d5bfcaedf96a`.

## Live facts independently checked

| Source and authority boundary | Live observed |
| --- | --- |
| Canonical S07 table/function dependencies | **15 / 15** exist (`public.editions`, `shows`, `participants`, legacy vote projection, Televoting rounds and aggregate stores, source metadata and results builder, permission and digest helpers) |
| S07 source projection provenance store | Missing |
| S07 transaction-scoped owner-only materialization writer context | Missing |
| S07 canonical published-result materializer / official round adapter | Missing |
| S07 projection ownership row trigger | Missing |
| Existing `public.televote_votes` projection | **803 rows across 49 distinct shows**; no null show identities; **6 negative-point rows**, which MUST remain correctly signed |
| Televoting rounds | 2 draft, 7 locked, 2 calculated; 0 with `results_status='published'` |
| Combined aggregation | 1 persisted `status='published'` but `results_outdated=true`; 0 current, non-outdated published aggregations |
| RLS on `public.televote_votes` | Enabled |
| `has_table_privilege` DML for `anon`, `authenticated`, `service_role` | All three roles currently report INSERT, UPDATE and DELETE privileges. This is only a catalog grant check, **not** proof that RLS/statement guards permit any actual unauthorized write. |

These results specifically prohibit any careless `DELETE FROM public.televote_votes`, historical ballot rewrite, synthetic provenance rows, forced publication or silent normalization of negative points. A now-outdated published Combined result is NOT a valid current source snapshot. Creating the S07 table and source hooks **without S08 authority retirement** would leave an incomplete transition.

## Required canonical source and testing

- Newer merged [PR #2445](https://github.com/solarissongcontest/solarisstudio/pull/2445) supplies `scripts/stage-v3-s07-televote-source-truth.mjs`, a source-pinned reconstruction of historical S14 Televote 01000/01020 plus signed Combined follow-up. The guard uses a private transaction/show writer gate and **owner-only arbitrary-payload materialization**; do not revive historical 01010's caller-settable custom-GUC bypass.
- Merged [PR #2518](https://github.com/solarissongcontest/solarisstudio/pull/2518) adds S08 all-show single-writer denial tests. Existing network-none PostgreSQL 17.11 S07/S08 fixture validates replay, signed deductions, fake marker denial, accepted-ballot preservation and duplicate authority refusal, but does **not** constitute private production backup equivalence.
- Draft [PR #2404](https://github.com/solarissongcontest/solarisstudio/pull/2404) is older and local-only; its original container rehearsal file conflicts with the newer improved main-branch isolated harness. Never replace newer production-safety scaffolding with the old version.

## Release blocker

Before production application, the System owner must demonstrate the *combined* source-truth plus S08 all-show direct API DML retirement against the **actual recovered owner/role/ACL baseline**, with exact existing 49 show scopes, signed scores, published/outdated source versions, transactional rollback, and official Results readback. Every historical ledger identity remains absent unless independently and safely reconciled. CI and browser tests **never** connect to hosted Supabase.

This document does not authorize live deployment or certify the remaining three source effects.
