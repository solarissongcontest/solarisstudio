# S06 connector-only five version-ledger fixtures

**LOCAL ONLY / NO S06 RELEASE CERTIFICATION / NO hosted migration or backup.**

Read-only production `pg_catalog` on 10 Nov 2026 reported five small, independent version-ledger identities with one real foreign-key parent each, all parents already reproduced by the earlier 56-table hosted-observed S02 fixture:

| New ledger | Real FK parent |
| --- | --- |
| `public.studio2_confirmation_review_versions` | `public.submissions` |
| `public.studio2_confirmation_round_versions` | `public.submission_rounds` |
| `public.studio2_jury_window_versions` | `public.editions` |
| `public.studio2_permission_subject_versions` | `auth.users` |
| `public.studio2_participation_status_versions` | `public.editions` |

Every table had 0 ordinary triggers, 0 RLS policies, 3 constraints (one FK, PK, version CHECK), 1 index, RLS enabled and explicit role privileges. Source SQL reproduces observed definitions without application rows. Networkless CI imports the unchanged **56 parent relations + these 5 ledgers in one PG17.11 instance**, checks 61 physical objects, extracts the complete local catalog and compares all 17 target fields against the frozen 215-relation hosted metadata. Synthetic failures test identity duplication, RLS/ACL/column/constraint/index drift and unsafe certification claims.

**Evidence is five-table-only fingerprint compatibility.** Existing 56 parents are not all proven full-digest-equal by this job. The other seven separate S06 tables from #2430 are not included here, and the combined 63-table S13→S14 donor is independently handled in #2431. No claim of 68 integrated tables, no entire hosted-head equivalent DB, no 727-routine/role/extension migration proof. Release still NO-GO until full S06 acceptance.

CI must reject remote DB variables and run Docker with `--network none` without host port mappings. No production SQL writes, no secrets, no deployment or S07.
