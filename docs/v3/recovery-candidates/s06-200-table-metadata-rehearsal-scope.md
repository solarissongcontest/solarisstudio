# S06: 200/215 table-identity recovery fixture candidate (NOT CERTIFIED)

## Source baseline and target

Source baseline main `431187822ac7ee635e7b22126a02dbaa7cc17705` (PR #2439 merged, 150/215 hosted-observed physical table identities). This branch adds **exactly 50 distinct, dependency-closed, zero-row table identities** from the same frozen PostgreSQL 17.11 hosted catalog, reaching **200/215 (93.0%)** in a single **networkless disposable** local fixture if exact-head CI confirms parity. **15 table identities remain outside this fixture.**

## Mechanism and proof

- Bounded read-only hosted `pg_catalog` inspection supplies names, column type/ordinal/default/nullability, PK/UNIQUE/FK/CHECK constraints, indexes, 89 row-level policies, 66 user-defined triggers, owner and ACL order; **no user data or exported function bodies**.
- All 50 tables are defined in `evidence/s06-hosted-second-fifty-relations-local.sql`. 69 foreign keys are staged after the requisite parent unique/primary constraints and all table creations; this is a *local recovery catalog candidate*, not a migration.
- The `public.app_role` enum is conditionally created with observed `organizer` and `viewer` labels if not already defined in the earlier fixture. Any otherwise unresolved routine dependencies are represented by conditional, **nonfunctional, fail-closed** local-only function signature stubs; existing earlier local functions must not be overwritten. Stubs raise if executed and **do not assert real behavior or authorization parity**.
- The original 56 retain their scope-limited S02 comparisons. The prior 94 full-field table fingerprints retain their existing comparators, while a new strict offline verifier compares all **17 frozen catalog fields** for the additional 50. The fixture must contain 200 exact, nonoverlapping table identities in one networkless PostgreSQL 17.11 en-US ICU database, with complete digest checks for 144 non-S02 identities.
- Required networkless rehearsal must: prove exact SHA/local isolation and source contracts; reject missing S13; verify real S13→S14 upgrade; inject an Archive DDL failure; prove atomic rollback; restart successfully on the same database; refuse duplicate application; assert the same **144 strict fingerprints** survive; and explicitly **reject 215/727 full-hosted equivalence**.

## Hard boundary / outstanding work

This is **table metadata coverage only**, not database restoration. Unmodeled are **15** physical relations, full **727-routine implementation / security / dependencies**, role memberships, Supabase extension state, actual application rows, migration history, policies' runtime authorization semantics, and all external side effects. The local-only placeholder routines are NOT tested for production behavior. An original 56-table scoped comparator is not a 17-field global proof. **No hosted DDL/DML, deploy, S07, production migration, public-write enablement or release certification** is authorized. Treat this as a *draft candidate* until exact-head tests, human source review and merge to `main` succeed.

## Excluded hosted relation identities (the remaining 15)

`private.v3_entry_reviews`, `private.v3_entry_versions`, `public.country_profile_sections`, `public.country_themes`, `public.integrity_case_appeals`, `public.prediction_entry_versions`, `public.prediction_items`, `public.public_ux_events`, `public.studio2_incidents`, `public.studio2_jury_members`, `public.studio2_notice_receipts`, `public.studio2_notice_versions`, `public.studio2_official_notices`, `public.studio2_show_publication_executions`, `public.submission_review_history`.

Project tracking: issue #574. This document only states candidate scope, not a CI result.
