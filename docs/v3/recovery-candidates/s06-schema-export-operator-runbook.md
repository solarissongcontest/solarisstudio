# S06: obtain and review hosted-head schema definitions (OPERATOR-ONLY)

**STATUS: PARTIAL/BLOCKED.** This is a source-only runbook and offline checker. It is not an export, a migration, production SQL permission, a successful local reconstruction, or S06 certification. Never run production database exports in GitHub Actions, Playwright, automated QA or previews. Do not start S07.

## Source and verified observations, 10 November 2026

- Start main 3791ba0bc25db01c3c3c4f763f03d773dd19616f. Merged #2403, #2425, #2426 and #2427 retained.
- The connected *Solaris Studio* Supabase project (not the unrelated other account project) reports PostgreSQL 17.11. Metadata-only API calls, not manually executed SQL, returned **215 tables**: auth 27, private 13, public 149, televoting 26.
- Read-only migration-list API returned **497** recorded migrations, hosted head **20261101181812**. The original compatibility cutover remains **20261014020000**. Never edit or invent migration-history rows.
- Existing hosted catalog inventory contains 2,364 columns and 727 routine identities. The runnable S02/S06 fixture covers only 56/215 relation identities and 21 upstream RPC security/definition fingerprints; 159 relations lack a complete reconstruction. Existing fingerprints cannot reconstruct actual DDL.
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
6. Preserve the historical migration boundary and reconcile **all** missing-history effects. The Archive candidate stages eleven effects while the frontier inventory lists twelve Archive/Task/notification migrations; check whether source migration 20261019112500 (resolved-task notification invariant) is covered/superseded before claiming complete recovery.

## Additional metadata-only security advisory

The Supabase table-listing connector flagged **12 relations in the private schema** with RLS disabled. This is a review signal, **not proof they are internet-accessible**: exposed Data API schemas, grants, role inheritance and actual caller permissions have not been independently established. Do NOT auto-enable RLS or rewrite grants under S06. Inspect effective privileges and preserve existing write guards during the authorized role review.

**Final rule:** Even a successful TOC verification or full-catalog fingerprint match cannot mark S06 DONE. Only independently reviewed hosted-equivalent disposable replay and the full recovery acceptance suite can do that. No hosted SQL, production migration, deployment, secret change or public-write enablement is authorized by this runbook.
