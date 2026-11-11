# S06: obtain and review hosted-head schema definitions (OPERATOR-ONLY)

## Owner constraint and agent-first alternative (11 November 2026)

**The owner has no install-capable computer. Do not instruct them to install PostgreSQL, download a database dump, paste connection credentials, find an operator or request more Cloudflare/Supabase connection screenshots.** See [the project-wide agent-verifiable evidence policy](../agent-verifiable-evidence-policy.md).

**Operational replacement for the owner-facing S06 workflow:**

1. A connected ChatGPT session verifies the exact GitHub main/PR SHA and the *Solaris Studio* Supabase project using read-only connector metadata, table/column inventory, recorded migrations, extensions and available security advisors. Capture only sanitized identities, counts, hashes, risk classifications and timestamps.
2. The session checks all accessible source contracts and networkless CI results, including the 215-table catalog inventory and S13→S14 local recovery. Report exact source/fixture scope, missing routines, unresolved role grants and any other unobserved semantics.
3. The session prepares a **tool-verifiable evidence matrix** with `DIRECTLY OBSERVED`, `REPRODUCED IN ISOLATION`, `SOURCE-INFERRED` and `UNKNOWN` statuses. Do not equate local source proof with a complete hosted-head restore.
4. The integrator continues unrelated V3 tasks and an explicitly scoped owner-only beta **without** using this incomplete proof to authorize unsafe hosted migration, official-write workflows or a full production-grade S06 certification.
5. If production release of a high-risk operation genuinely depends on the missing full hosted definitions/roles, that operation remains **BLOCKED** until safe equivalent evidence becomes available. The owner is asked for a scope decision, **not** to perform database engineering.

The following manual-export procedure is retained strictly as an **optional future high-assurance method**, not the default next action or a prerequisite for the agent-first path. The absence of an export cannot be papered over by declaring S06 DONE.

**STATUS: PARTIAL/BLOCKED.** This is a source-only runbook and offline checker. It is not an export, a migration, production SQL permission, a successful local reconstruction, or S06 certification. Never run production database exports in GitHub Actions, Playwright, automated QA or previews. Do not start S07.

## Source observations and current offline scope, 10–11 November 2026

- Start main 3791ba0bc25db01c3c3c4f763f03d773dd19616f. Merged #2403, #2425, #2426 and #2427 retained.
- The connected *Solaris Studio* Supabase project (not the unrelated other account project) reports PostgreSQL 17.11. Metadata-only API calls, not manually executed SQL, returned **215 tables**: auth 27, private 13, public 149, televoting 26.
- Read-only migration-list API returned **497** recorded migrations, hosted head **20261101181812**. The original compatibility cutover remains **20261014020000**. Never edit or invent migration-history rows.
- Frozen hosted catalog inventory contains 2,364 columns and 727 routine identities. The merged networkless S02/S06 fixture now contains **215/215 distinct physical table identities**: the original 56 have scope-limited checks, while the additional 159 have strict catalog-field digest comparisons. This is **not** 215 fully equivalent hosted tables: the fixture is zero-row, some functions are deliberately non-executable fail-closed placeholders, and the 56 original identities remain scope-limited. Previously reported routine identity coverage is **199/727**, not 727 executable hosted routine definitions; 21 upstream RPCs additionally have bounded security/definition fingerprints. Neither names nor hashes reconstruct full DDL or runtime semantics.
- Connected Supabase actions expose metadata, table listings and TypeScript generation, **not a complete schema-only dump**. Neither Drive search nor mounted project files revealed a complete export.
- The standard Supabase CLI db dump command excludes managed schemas such as **auth** and does not include custom roles by default. It is insufficient for the required hosted-head equivalence. Official references: https://supabase.com/docs/reference/cli/supabase-db-dump and https://supabase.com/docs/guides/self-hosting/restore-from-platform.

## Manual export path (NOT AUTHORIZED TO RUN IN THIS SESSION)

**STOP until the project owner separately authorizes a bounded read-only hosted schema export.** Original instructions forbid production SQL execution. A designated operator, not CI or this chat, must carry out the export on a trusted machine with PostgreSQL 17 pg_dump. Never paste database credentials, connection strings, the dump or function bodies into chat, GitHub or CI logs. Use a locally secured PGPASSFILE (mode 0600), not command-line passwords.

Example commands **only after separate operator approval and exact project selection**:

~~~sh
# Operator workstation only. Not for GitHub Actions or production SQL Editor.
pg_dump --version  # PostgreSQL 17 client required
umask 077
# Configure PGHOST, PGPORT, PGUSER, PGDATABASE=postgres, PGPASSFILE,
# PGSSLMODE=require using the designated project's verified connection.
mkdir -p "$HOME/solaris-s06-private"
pg_dump --no-password --format=custom --schema-only \
  --schema=auth --schema=private --schema=public --schema=televoting \
  --file="$HOME/solaris-s06-private/hosted-head.schema.dump"

# Offline inspection: this does not restore SQL or contact production.
pg_restore --list "$HOME/solaris-s06-private/hosted-head.schema.dump" \
  > "$HOME/solaris-s06-private/hosted-head.schema.toc"
node scripts/v3-s06-schema-toc-preflight.mjs \
  "$HOME/solaris-s06-private/hosted-head.schema.toc" \
  "$HOME/solaris-s06-private/toc-preflight.json"
sha256sum "$HOME/solaris-s06-private/hosted-head.schema.dump"
~~~

Do not pass --no-owner or --no-acl: ownership and privileges are essential evidence. Never dump application data (--data-only), use migration repair, update the production migration frontier, or treat a clean-source local reset as hosted truth. Exporting managed auth is distinct from safely restoring it: a stock local Supabase instance may already contain platform-managed objects. Restoration requires review and a **separate networkless PostgreSQL 17.11 target**.

## What the offline preflight establishes

The Node checker reads only the operator's text pg_restore TOC plus the frozen 215-relation inventory already committed under evidence. It requires the PG17.11/custom-format headers; fails on missing, extra or duplicate table identities; and refuses data-bearing TOC entries (TABLE DATA, SEQUENCE SET, BLOBS and materialized view data). Its output is explicitly **TOC_SCHEMA_ONLY_PREFLIGHT_NOT_CERTIFIED**.

It does **not** inspect private function bodies, prove sanitization, reproduce role memberships, load a database, query hosted production, or certify an S13/S14 upgrade. The dump must remain private even when the TOC checker passes.

## Independent review and next local-only execution gate

1. Capture provenance (exact project, database version, export date/time, observed migration head, SHA256, permitted read-only export command, operator and independent reviewer). Review local decoded schema for literal credentials or sensitive configuration without publishing the original dump. Any redaction that changes semantics must be disclosed as a parity blocker.
2. Capture the effective role attributes, inheritance and memberships from a **separately approved, bounded, password-free** operator metadata review. pg_dump --schema-only does NOT capture role membership; never upload raw pg_dumpall --roles-only without a credential review. Record privileged SECURITY DEFINER/search_path/grants/default privileges accurately.
3. Account for auth/platform-managed objects, extension-owned definitions, schema/default ACLs, views, sequences, types, RLS policies, functions, triggers, FKs, constraints and indexes. Unknown objects remain unknown, never synthetic no-op functions.
4. Import into **networkless disposable PG17.11 with no published ports**, after independent review. Compare full local catalog with the existing frozen hosted-digest verifier, and independently validate executable function dependencies, privileged caller behavior and all dynamic SQL.
5. Seed representative *synthetic* Archive, lifecycle, Tasks, notifications, Results, Televote and upstream relations. Run the complete ordered S13→S14 recovery, refusal before mutation, injected post-DDL rollback, same-DB restart, duplicate refusal, negative authorization and second replay, preserving exact-SHA machine-readable evidence.
6. Preserve the historical migration boundary and independently reconcile **all** missing-history effects. The merged Archive candidate already stages **all 12 canonical historical Archive/Task/notification effects in source order**, including **`20261019112500`** (resolved-Task notification invariant). `node --test scripts/v3-s14-archive-forward-effects.contract.test.mjs` checks each original SQL effect body and its order against the candidate, excluding only the original migration-contract registration in favor of one new forward-recovery declaration. **Do not reconstruct stage 12, insert fabricated historical migration rows, or mistake this source-level proof for a hosted-equivalent upgrade.**

## Execution evidence and acceptance boundary

The merged source contract is in `scripts/v3-s14-archive-forward-effects.contract.test.mjs`; the existing **synthetic** disposable local replay is `scripts/rehearse-v3-s14-archive-forward-effects-local.sh`; and `.github/workflows/v3-s14-archive-forward-effects-local.yml` runs the clean-source and networkless catalog-observed fixtures. Those tests already exercise explicit S13-first dependency refusal, pre-DDL dependency drift, transaction rollback after injected post-DDL failure, same-database restart, duplicate refusal, a second replay, and focused Archive/Task/notification guards. **None is a substitute for the actual hosted-head-equivalent isolated baseline.**

A trusted operator must obtain separate approval for the read-only schema export and any additional read-only role metadata review. On a trusted operator-controlled workstation, before any restore or execution, an independent reviewer must inspect the private export and its TOC for sensitive configuration, required `auth`, `private`, `public` and `televoting` objects, extension dependencies, owner/role compatibility, and exact PostgreSQL 17.11 applicability. The review must not publish raw schema, function bodies, credentials, TOCs containing sensitive names, or connection details. All raw materials and full logs remain private, outside GitHub, Actions, CI artifacts, PRs and chat.

Only after that review, restore into a **fresh, networkless, unexposed PostgreSQL 17.11 disposable instance** with independently provisioned compatible roles and extensions, never into hosted production or a shared development database. Do not blindly restore over an existing managed `auth` schema. Any restore error or missing dependency is a **STOP**, not a reason to apply `--no-acl`, `--no-owner`, `--clean`, `--if-exists`, or dummy runtime functions to make the replay green. Validate the restored pre-recovery catalog, roles, RLS, grants, routines, dependencies, trigger functions and baseline against the frozen hosted evidence **before** S13 or S14. A missing expected hosted definition, role membership or executable dependency means hosted equivalence remains unproven.

In that validated disposable database, record the exact reviewed recovery source SHA and run the S13 foundation **first**, then the ordered 12-stage S14 candidate, with a separately snapshotted and disposable baseline for negative cases. Verify: missing S13 or any required upstream dependency fails **before mutation**; the injected post-DDL failure rolls back; the same database restarts cleanly; repeated application refuses or is provably idempotent according to the operation contract; Task/notification/delivery deduplication and historical Archive links are preserved; authorization denials, RLS/grants and no alternate writer remain valid; and required catalog/security evidence is unchanged except explicitly reviewed forward effects. Compare before/after full-catalog digests and retained evidence, not merely object counts. No fake history insertions or production replay.

The independently approved evidence package must identify fixture provenance, operator and reviewer, PostgreSQL version, observed migration head, source and fixture hashes, commands, sanitized pass/fail outputs, negative-case results, rollback/restart behavior, final candidate SHA, exact-head CI links and any departures from the hosted baseline. Keep full sensitive dumps and logs exclusively in approved private storage. Dispose of the isolated database and confidential export under the approved retention policy; document disposal. If any mandatory property is unknown or fails, keep the S06 checkbox **unchecked** and status **PARTIAL/BLOCKED**. This operator procedure is **not** permission to export or mutate the hosted project.

## Additional metadata-only security advisory

The Supabase table-listing connector flagged **12 relations in the private schema** with RLS disabled. This is a review signal, **not proof they are internet-accessible**: exposed Data API schemas, grants, role inheritance and actual caller permissions have not been independently established. Do NOT auto-enable RLS or rewrite grants under S06. Inspect effective privileges and preserve existing write guards during the authorized role review.

**Final rule:** Even a successful TOC verification or full-catalog fingerprint match cannot mark S06 DONE. Only independently reviewed hosted-equivalent disposable replay and the full recovery acceptance suite can do that. No hosted SQL, production migration, deployment, secret change or public-write enablement is authorized by this runbook.
