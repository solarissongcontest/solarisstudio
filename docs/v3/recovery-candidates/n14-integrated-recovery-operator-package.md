# Solaris V3 N14 single-owner recovery operator package (candidate, not approved)

**Status: LOCAL RECOVERY CANDIDATE / PRODUCTION STOP.** This document is an operator package, not a migration approval, deployment approval, public-write activation, or certification. Never copy the LOCAL-ONLY parent reconstruction scripts into hosted production.

**#2531 integration:** [System PR #2531](https://github.com/solarissongcontest/solarisstudio/pull/2531) merged as source main `49b022a698078937abdd0dabf522162d6421623b`. The existing canonical `supabase/migrations/20261115000100_v3_televote_ballot_writer_retirement.sql` is in the same driver **after S08** and before Results operation/CAS. Its historical function source reconstruction is LOCAL-ONLY fixture setup and must never be applied to hosted production. Confirm its exact SHA-256 entry in the generated source-manifest artifact before any production-candidate freeze. This merge does **not** approve hosted migration or establish real backup/recovery evidence.

## Authority and scope

- System-owned integrated source: `.github/scripts/v3-observed-owner-recovery-local.sh`. This orchestrates the existing, frozen S13, Archive, S07/S08, Jury and Results source donors.
- Added governed Confirmation source: `scripts/stage-v3-confirmation-access-recovery.mjs`, using the five already-merged source migrations without altering their bytes.
- The [merged #2528](https://github.com/solarissongcontest/solarisstudio/pull/2528) System-owned `docs/v3/recovery-candidates/s16-launch-table-truncate-cutover.sql` retires direct INSERT/UPDATE/DELETE/TRUNCATE/table-maintenance permissions on Confirmation `public.submissions` and `public.edit_tokens`, and direct RLS-independent TRUNCATE on **fourteen hosted-observed launch-critical tables**. It preserves SELECT/RLS and already-governed RPCs, and verifies S08/Combined effects without replacing them. The scoped recovered-state test proves **18 Confirmation DML and 42 TRUNCATE** API-role denials.
- [PR #2529](https://github.com/solarissongcontest/solarisstudio/pull/2529) extends **that same stage**, without a parallel migration framework, to retire `public.results` direct DML while retaining canonical Results CAS and publication readback. It was subsequently **MERGED** as exact main `2945c696e6df5e4e67769a4871b8c3114e997a0f` after eight applicable PR-head workflows passed at `a4248a2a358f6982e5870ff7a457c9d877c18595`. Its nine real API-role Results DML denials and positive CAS readback passed locally; these are integrated source protections, **NOT** installed production effects.
- Hosted catalog observation: PostgreSQL **17.11**, project identity **`dkxmnvekiopyesuzggeu`**, last observed hosted migration tip **`20261101181812`** and 497 migration records. This is a dated observation, not permission to assume the catalog remains unchanged.
- Evidence for the critical Confirmation parents: `docs/v3/recovery-candidates/evidence/confirmation-access-prerequisites-observed-2026-11-15.json`. Owners, function-body fingerprints, SECURITY DEFINER settings, RLS and grants, six table column-shape fingerprints, policy-definition fingerprints, missing commands and indexes are pinned from bounded read-only hosted catalog inspection. An unexpected column/policy/owner/ACL change aborts atomically.
- The intended release is the original **14 November soft-launch scope**. World, Fantasy, Prediction and other expansions are outside this cutover.

## Verified production backup availability and required owner action (15 November 2026)

**HARD NO-GO: NO ACTUAL BACKUP OR REAL RESTORE HAS BEEN VERIFIED.** A read-only Supabase project lookup identified `dkxmnvekiopyesuzggeu` on PostgreSQL **17.11** and the connected organization `bemdjuovpddkkllhmljs` on the **Free** plan. This metadata does not identify any owner-created external backups. Neither the connector nor this engineering session has obtained a production backup file or performed a real production-data restore.

Supabase's current [database backup documentation](https://supabase.com/docs/guides/platform/backups) and [Free backup FAQ](https://supabase.com/kb/faqs/platform/free-plan-backups) state that automatic daily backups are not included on Free; managed PITR is an additional paid-plan feature. **Do not assume an automatic backup exists.** On the current plan, recovery must use an independently created and protected manual export unless the owner separately upgrades and verifies a new managed backup. An upgrade alone is not proof of a restorable recovery point.

### Exact prerequisite for the current Free-plan recovery

1. **Explicit owner authorization for a controlled backup export**, performed by a named privileged operator from a secure, owner-managed machine. This is a data-extraction operation and has NOT been approved or executed here. No CI job, test runner, Actions artifact, GitHub repository, browser crawler or agent should retrieve private production records. Do not put tokens, database passwords, private data or even encrypted backup archives in GitHub.
2. **Consistent pre-migration recovery point:** record UTC start/end, database server/version and authoritative project ID, read/write quiescence or consistency strategy, a fresh backup after controlled official writes stop, backup SHA-256 and an operator-attested file inventory. Set an explicit maximum allowable data-loss window. Free offers no managed PITR for in-between transactions.
3. **Complete export coverage:** follow the current [Supabase CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) and confirm the installed CLI's `--help` rather than assuming a schema-only dump is sufficient. Capture reviewed schema, *actual data*, roles/grants, custom `auth`/`storage` objects, triggers/functions, and original migration evidence without manufacturing history. Supabase CLI's default dump can omit role/data contents; verify all required separate passes. Preserve source project encryption/Vault dependencies through a separately authorized, secret-safe recovery procedure. Never publish those keys or dumps.
4. **Storage byte coverage:** database backup metadata does NOT include Storage object bytes. Preserve the actual protected media/object bytes, object paths, version/checksum and access controls in a separately secured, internally consistent inventory. Verify representative byte hashes and restoration; a restored `storage.objects` row pointing at a missing bucket object is **not** a successful restore.
5. **Protected backup handling:** encrypt at rest and in transit; maintain access restricted to the designated owner/operator; retain at least one independent off-project copy; record retention, restore credentials held outside the project, integrity hashes and independent recovery destination. Set a periodic verification/retention cadence before official voting starts.
6. **Actual independent restoration rehearsal:** restore the owner-held production-derived backup into a disposable, access-controlled **nonproduction** PostgreSQL/Supabase target, isolated from official users, webhooks, notifications and production applications. Do not overwrite or restore into production. Ensure this environment cannot call production Supabase, push, email or third-party systems while verifying it. Check schema and object/ACL fingerprints, eligible credentials/roles, materialized Storage objects, row-count and digest invariants for historical Results, votes, receipts, publications, authorizations, RLS/triggers, canonical RPCs and recovery readback. Validate restoration from cold start, not just `pg_restore` exit status.
7. **Restore acceptance record:** retain only sanitized outcomes, operator identity/authorization reference, source/recovery-point UTC timestamps, protected artifact SHA-256 IDs, target environment identity (never credentials), duration, counts/digest matches, errors and explicit pass/fail. Private backup contents remain outside repository and CI. Repeat post-restoration authorization/recovery checks using isolated actors and do not replay official submissions against production.
8. **Failure branch:** if any backup component, matching Storage bytes, Vault dependency, ACL, identity, vote/result digest, restore test, or operator authorization is absent, **STOP before hosted migration**. Keep maintenance and official writes closed; capture the point of failure without attempting a production restore. Use only reviewed forward repair for already committed SQL stages.

**Outstanding owner decision:** authorize a privately performed manual export plus tested independent restoration while remaining on Free, **or** separately approve an appropriate paid backup capability and then prove its actual restore. The first option avoids subscription costs but requires more operational discipline and accepts a longer possible recovery-point gap; the second is not automatically sufficient and does not recover Storage bytes. Do not pick a paid plan, incur charges, access project secrets or export data without the owner's explicit decision.

**Current evidence:** read-only metadata and official backup policy only; **real backup present: UNKNOWN; real backup restorable: NOT VERIFIED; Storage-byte recovery: NOT VERIFIED; owner export permission: NOT GRANTED**. Synthetic networkless PG17.11 restores already tested by the driver remain valid *synthetic* evidence, never a substitute.

## Exact **local** dependency order

All candidates below are individually transaction-guarded. The integration driver is the source of the exact path list, and its CI-created `observed-owner-recovery-proof.json` contains the reviewed SHA256 of each emitted stage. **If this list disagrees with the exact-head driver, STOP.**

1. `forward-only-s13-foundation.sql`: five foundation tables, seven RPCs and strict semantic registration.
2. `forward-only-s14-archive-integrated-local.sql`: guarded Archive/source prerequisites, no historical data rewrite.
3. Source-pinned governed Confirmation SQL generated by `node scripts/stage-v3-confirmation-access-recovery.mjs`. Its parent metadata must first match hosted catalog evidence **without** local-only reconstruction.
4. `node scripts/stage-v3-s07-televote-source-truth.mjs` output: canonical vote provenance/source application and private write context.
5. The existing atomic/Archive, public snapshot, Results authority and result-read source candidate stages, in the exact order given by the driver.
6. The existing governed Jury candidate and Jury table/column authority retirement. No direct API/legacy ballot writer.
7. The existing Combined write-deferral candidate. Do not create a competing aggregation writer.
8. `s08-televote-single-writer-local.sql`: projection transaction guard and direct vote-projection DML retirement.
9. The existing Results operation-engine / reviewed-input CAS / protected operation-table stages, in the exact source-defined order.
10. `s16-launch-table-truncate-cutover.sql`: after the Results CAS stage, retire Confirmation direct API DML and RLS-independent TRUNCATE/table-management grants on fourteen relations; assert S08/Combined closures. The **merged #2528** local proof requires **18 Confirmation DML and 42 TRUNCATE permission-denied executions** through `authenticator` with `SET LOCAL ROLE anon/authenticated/service_role`. The **merged #2529** successor adds nine Results DML denials, column-grant drift refusal and post-cutover canonical readback. Use only the exact approved source baseline and matching artifact manifest; do not splice an unmerged candidate into a hosted sequence.
11. Negative **and** positive authority probes, synthetic data preservation, interruption/duplicate tests, and synthetic `pg_dump` → independent `pg_restore` + post-restore checks.

Steps 4–9 have more than one concrete SQL stage; use the exact-SHA CI artifact manifest rather than treating this abbreviated high-level sequence as a raw psql batch. Source-only parent reconstruction scripts (`stage-v3-*-prerequisites-local.mjs` and fixture SQL) are test infrastructure, **not approved production recovery operations**.

## Scoped recovery-effect reconciliation, 15 November 2026

| Authority / effect | Hosted catalog observation | Local recovery and acceptance classification |
|---|---|---|
| S13: five private tables + seven RPCs | ABSENT | RECOVERED in isolated PG17.11; full hosted-runtime compatibility UNKNOWN |
| S14 Archive gates / prerequisites | ABSENT or PARTIAL by individual dated effect catalog | RECONSTRUCTED/RECOVERED in isolated dependency chain; whole-hosted equivalence UNKNOWN |
| Confirmation governed preview/apply and version/receipt | ABSENT; existing parents fingerprinted | RECOVERED; exact parent ACL/column/policy preflight and negative denial verified; recovered positive submission lifecycle UNKNOWN |
| Confirmation direct table mutation | PRESENT API-level DML + TRUNCATE grants; RLS policy allows capable authenticated direct writes | Local forward cutover denies 18 real-role DML + 6 Confirmation TRUNCATE attempts; positive command coverage after cutover PARTIAL |
| S07 source provenance / canonical write-context | ABSENT | RECOVERED locally; upstream source and actor-scope checks pass |
| S08 all-show projection guard | ABSENT | RECOVERED locally; owner/API direct writes refused |
| Jury direct ballot mutation / governed receipt | Source cutover merged; hosted effective complete authority UNKNOWN | RECOVERED in local scope, actual API-role denial and governed receipt replay; full contest still UNKNOWN |
| Results operation v2/CAS and historical snapshot | v2 RPC ABSENT; legacy Results objects exist | RECOVERED in local scope; 24 operation-table DML/TRUNCATE denials, CAS/replay and synthetic historical snapshots verified |
| Direct `public.results` API DML | PRESENT effective INSERT/UPDATE/DELETE for anon, authenticated and service_role; ordinary-mode canonical enforcement is not established by maintenance guard | Source-protected by **MERGED #2529**; local networkless PG17.11 passed 9 real-role denials and post-cutover readback/CAS; hosted protection NOT INSTALLED |
| Full S16 across every official launch writer | PARTIAL/UNKNOWN | NOT CERTIFIED; scoped Confirmation/Televote/Jury/Results checks do not replace full S16 report |
| Clean-source and 66-country recovered official contest | Production data not inspected | Clean-source acceptance CI tracked separately; complete hosted-observed-equivalent lifecycle NOT VERIFIED |
| Real production backup restoration | No evidence | NOT VERIFIED; CI synthetic `pg_dump/pg_restore` is not production backup proof |

Every UNKNOWN above is a **launch blocker**, not a presumption of compatibility. Hosted history may disagree with source even where effects exist. Do not fabricate or rewrite `supabase_migrations.schema_migrations` records.

## Bounded current-production schema-scope gate (15 November; read-only, not a backup)

The connected **Primary** Supabase account returned `ACTIVE_HEALTHY` for `dkxmnvekiopyesuzggeu`, PostgreSQL `17.11.0.002` in `eu-central-1`. The hosted migration API returned **497** records, latest `20261101181812`. A bounded `pg_namespace`/`pg_class` catalog-only query (no private rows or vote records) identified the following table counts; these counts are **not backed-up data counts**:

| Schema | Hosted table identities | Recovery classification |
| --- | ---: | --- |
| `public` | 149 | Application state; must be covered |
| `private` | 13 | Application authority and audit; must be covered |
| `televoting` | 26 | Official voting; must be covered |
| `auth` | 27 | Accounts, sessions and relevant authorization; preserve with Supabase-compatible restore strategy |
| `storage` | 10 | Metadata and policies only; object bytes require a separate export |
| `supabase_migrations` | 1 | Preserve original migration records separately, never rewrite hosted history |
| `vault` | 1 | Encrypted data without source encryption root is **not** a verified recovery |
| `cron` | 2 | Review required jobs/schedules; restore disabled, without dispatch |
| `net` | 2 | Provider/async HTTP dependencies; never replay outbound requests |
| `realtime` | 10 | Provider-managed; reconstruct/verify compatibility rather than blindly replay |
| `extensions`, `graphql`, `graphql_public` | 0 tables | Preserve required extension/provider configuration and verify views/functions |

**Mandatory scope resolution before running the example below:** the five explicit `pg_dump --schema` flags cover only `auth`, `private`, `public`, `storage` and `televoting`. The resulting archive is a **scoped application database artifact**, not a complete production recovery set. In particular, `supabase_migrations` is omitted, `vault` needs separately reviewed encryption-root recovery, and `cron`/`net`/`realtime` need explicit classification. A clean exit from that command must **never** change backup-completeness status to PASS.

The [official Supabase CLI backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) uses separately reviewed `--role-only`, schema and `--data-only --use-copy` exports. Its [migration-history section](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore#preserving-migration-history) separately exports the `supabase_migrations` schema **and** data; it also identifies custom `auth`/`storage` policy and trigger handling. The [platform-to-self-hosted guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform) warns that raw `pg_dump` includes provider internals and may fail on restore. A PostgreSQL custom archive may still be used for the reviewed application-only scope, but **the operator must select and validate one complete, destination-compatible combined recovery procedure**, including original migration records, before release approval. Never feed an entire raw provider/internal dump blindly into a managed Supabase target.

**Operator verification gate:**

1. On the separately approved trusted workstation, record `pg_dump --version`, `pg_restore --version`, `psql --version`, `supabase --version`, `supabase db dump --help` and `supabase storage --help` where applicable. This ChatGPT environment has **not** verified any local CLI installation. Do not invent version or flag evidence.
2. Privately choose a **named source schema allowlist** from the fresh database catalog, classify each hosted schema as backed up, provider-managed/rebuilt, or explicitly excluded with written reason, and reconcile expected table identities, original migration-history count, table data coverage, ACLs, RLS, extensions and functions against each export TOC. Missing privileges, omitted schemas or a partially readable archive **fail closed**. For a custom archive, inspect `pg_restore --list` in the private operator environment.
3. Keep official writes quiesced across **all** separate database, roles, migration-history, Storage-byte and configuration export passes, or use a separately reviewed cross-artifact consistency strategy. A single `pg_dump` snapshot does not make independently executed CLI dumps and object transfers a consistent recovery point by itself.
4. Encrypt the **entire** set (DB, roles/history, object bytes, verified inventories and any sensitive configuration); keep a independently accessible off-project copy. Never put private files, passwords, S3 access keys, Vault material or dump output in GitHub, ChatGPT or CI.
5. For Storage bytes, the [official Storage transfer guide](https://supabase.com/docs/guides/self-hosting/copy-from-platform-s3) uses approved S3 credentials and `rclone` between endpoints; direct copying into self-hosted Storage filesystem volumes is not equivalent. Verify per-object paths, revisions where applicable, hashes, bucket policies and private access after restoring. An object-row-only restore **fails**.
6. Recover Auth providers, redirect URLs, email/SMTP, Edge Function configuration (15 function identities were observed through read-only metadata, **not backed up**), runtime secrets, Vault/root keys, extension versions and external dependencies in the **isolated destination** without live dispatch. If a secret or provider-managed component cannot be reconstructed, record **BLOCKED**, never silently remove it.
7. Preserve the untouched independently restored baseline. Execute the **exact System-owned ordered manifest** only on a separate clone; verify original historical vote/Result counts and digests, then real API-role positive and denial tests without external side effects. The generated manifest's staged SHA-256 entries are **not frozen by this catalog query**.

**Evidence state of this inspection:** Production metadata VERIFIED; actual private-data export **NOT AUTHORIZED / NOT RUN**; Storage bytes **NOT COPIED**; Auth/Vault/external recoverability **NOT PROVEN**; production-derived isolated restore **NOT RUN**; migrated-restoration rehearsal **NOT RUN**; production SQL **NOT APPLIED**. All remain hard NO-GO gates.

## Operator-only backup / independent restore execution boundary (NOT AUTHORIZED)

This is an operational checklist, **not** an instruction to run extraction in this ChatGPT session, GitHub Actions or on the owner's school computer. The existing [S06 operator export runbook](./s06-schema-export-operator-runbook.md) already contains a schema-only example. The procedure below is for a **different, privately authorized full-data recovery point**. It requires a trusted operator-controlled PostgreSQL 17 client, a credential-secure environment, an independently isolated PostgreSQL 17.11 destination, an off-project encrypted backup repository and a separately maintained Storage export/restore process.

Before any export, the named owner/operator must approve an exact production project identity, consistent source-write freeze/recovery point, a bounded read-only extraction scope, RPO, backup location, encryption recipient, retention policy and independent restore target. Stop if any is absent. **This document grants none of these permissions.**

A reviewed manual example for that approved operator environment, never a CI task:

~~~sh
# PRIVILEGED OWNER-APPROVED WORKSTATION ONLY; DO NOT RUN IN CI.
set -euo pipefail
umask 077
: "${SOLARIS_BACKUP_OWNER_AUTHORIZATION:?Required private approval reference}"
: "${SOLARIS_PRIVATE_BACKUP_DIR:?Off-project private path required}"
: "${SOLARIS_AGE_RECIPIENT:?Verified recovery public-key recipient required}"
: "${PGPASSFILE:?Private 0600 PostgreSQL password-file path required}"
test "$(stat -c %a "$PGPASSFILE")" = 600
test -d "$SOLARIS_PRIVATE_BACKUP_DIR"
test "$(pg_dump --version | grep -oE '[0-9]+' | head -1)" = 17
test "$(pg_restore --version | grep -oE '[0-9]+' | head -1)" = 17
# PGHOST/PGPORT/PGUSER/PGDATABASE/PGSSLMODE must be separately verified
# by the named operator against project dkxmnvekiopyesuzggeu.
# Obtain approved consistent snapshot with official writes already frozen.
export PGSSLMODE=require
backup="$SOLARIS_PRIVATE_BACKUP_DIR/solaris-postgres-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
pg_dump --no-password --format=custom \
  --schema=auth --schema=private --schema=public \
  --schema=storage --schema=televoting \
  | age -r "$SOLARIS_AGE_RECIPIENT" -o "$backup"
sha256sum "$backup"  # Save only a sanitized digest/evidence record externally.
# A separate approved roles/grants, secrets/Vault, Auth-provider configuration
# and Storage OBJECT-BYTES package is mandatory. A database dump alone fails.
~~~

The above is a **reviewed template, not an executed or verified export**. It does not capture cluster-level roles, provider-managed configuration, Vault encryption keys, Storage object bytes, or external identity and notification configuration. Capture those separately using approved privileged procedures with consistent timestamps. The operator must check that the dump actually contains *data*, functions, triggers, policies and required schemas; insufficient source privileges must fail the backup rather than silently omitting protected relations. Do not print passwords or raw TOCs containing sensitive routine definitions into GitHub.

For isolated restoration, the operator must validate that the destination is **not** the production project, has no outbound integrations, is independently owned and has compatible PostgreSQL 17.11 extensions/roles. After approved role/environment preparation, decrypt the private archive only within that controlled destination and use `pg_restore --exit-on-error --single-transaction` to an empty reviewed target. Validate restored schema/grant/RLS/trigger/routine fingerprints, row counts and private vote/Result/receipt digests using the existing database restore runbook; separately restore Storage object bytes and verify their hashes and access controls. Record actual restore success, target identity, timestamp, duration and discrepancies outside public artifacts. A successful `pg_restore` exit alone is insufficient.

**Stop conditions:** unverifiable backup provenance, missing secure off-project copy, missing Storage object bytes, absent Auth/Vault/external configuration, invalid operator role, incompatible PG/extension versions, unexpected permissions, failed independent restore, historical result/vote integrity differences, incomplete hosted dependency effects, missing approved candidate SHA, or absent separate migration/deployment/public-write approval. Never proceed to hosted SQL on partial evidence.

---

## Operator preflight: STOP unless all verified

1. Obtain a **fresh exact source/main SHA**, the complete artifact manifest, passing required exact-head checks and one authorized System migration owner. No source SHA can be inferred from an old PR description or date.
2. Independently verify correct project identity, PostgreSQL version, current migration tip/history, migration effects, object signatures, column types, constraints, trigger bindings, function owners, explicit + inherited table/column privileges, RLS, SECURITY DEFINER, search paths, and all dependency digests. Any UNKNOWN or mismatch is a hard STOP. Missing history is not proof of missing effects.
3. Verify approved maintenance, publication and official-write lock boundaries, permission to schedule bounded user downtime, and a named recovery decision-maker. Never activate public writes in the same approval.
4. Obtain a **real production backup**, backup timestamp/PITR checkpoint, encryption/access verification, independent **actual backup restoration rehearsal**, and target restoration timings. A synthetic CI `pg_dump` does not satisfy this step.
5. Review exact source SQL and unmodified donor source fingerprints. Disallow change to applied migration history, old source migration bodies, any canonical result/ballot data, or client guards. Confirm CI and Playwright have no hosted Supabase endpoints or secrets.
6. Before every stage, repeat its individual catalog/ACL/dependency guard. All statements are fail-closed; **never** suppress a guard to make SQL apply.

## Change / interruption procedure (not authorized yet)

Only after a **separate, explicit hosted-database migration approval** may an operator use the signed SQL artifacts and the approved connection/transaction procedure. Execute the frozen ordered SQL files with `ON_ERROR_STOP`, finite statement and lock timeouts, a recorded stage ID and a single owner-level database authority. After each committed stage, record schema/ACL/trigger/registered-semantic-contract deltas and verify official rows and published snapshots unchanged.

If a stage aborts: leave maintenance and public writes disabled. Preserve error details and snapshot catalog, verify transaction rollback, and reconcile which earlier stages committed. Resume only from the first unapplied, independently requalified stage. **Never** bypass duplicate preflight, mark skipped migrations as applied, replay the historical migration directory, or restore over production as a shortcut.

If unexpected direct writer, RLS bypass, wrong-role grant, wrong-edition operation or stale CAS succeeds, stop immediately. A green SQL deployment log is not an integrity result.

## Mandatory verification before any activation

- S13 table/function/owner/schema and ledger contracts.
- Confirmation governed preview/apply, legitimate submission/update/receipt, unauthorized denial, delegation and edition context.
- Jury eligible draft/final/receipt and role isolation; direct table/column DML and TRUNCATE denial; secrecy.
- Televote source provenance, current show/round, duplicate and deadline safeguards; projection/Combined single-writer denial, deterministic reconciliation.
- Results calculation, review and CAS, stable published snapshots, publication secrecy and retries; direct pointer/table privileges denied.
- Actor-role negative tests using real `anon`, `authenticated`, `service_role` and owner sessions; include **actual execution**, not only catalog predicates. Preserve positive governed calls after table grant retirement, including corrections to already-confirmed responses, receipts and participant re-edit where authorized.
- Clean-source **and recovered hosted-observed-equivalent** complete Confirmation → Entry/Media → Jury → Televote → Results → Archive rehearsals.
- Restore behavior, synthetic and **real** backup evidence kept distinct; independent exact-SHA S13/S14/S15/S16 and Public/Organizer/Browser/Quality checks.
- Observable follow-up controls: error rates, egress, database health, receipts, reconciliation, deadline extensions, and abort criteria.

## Approval boundaries (independent)

1. **Hosted SQL migration approval:** currently **NOT GRANTED**. Only after this runbook and actual-backup/restoration and full recovered acceptance become verified.
2. **Production application / Cloudflare Worker activation:** currently **NOT GRANTED**. A `wrangler versions upload` is not traffic promotion.
3. **Official public-write activation:** currently **NOT GRANTED**. Requires confirmed official authority, independent release certification and separate explicit approval.

**No-Go while any mandatory authority, positive flow, recovered-state acceptance, exact-main certificate, real backup restore or approval is unknown or failed.** The PR is a source integration candidate; do not describe the production recovery as complete merely because its networkless scoped fixture passes.
