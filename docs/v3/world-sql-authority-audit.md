# TG0/TG19: offline World cross-PR SQL object collision preflight

**Status:** advisory source-only verification, not a merger, database parser, migration rehearsal, authorization audit or release certificate. **Session:** WORLD-AUTO-656914be21c3. WORLD-01 owns migration and SQL/RLS authority; WORLD-00 owns the World mainline merge queue.

## Purpose

Individual S13 migration checks and the separate cross-PR *filename/version* scanner can both pass even when two pending World PRs define the **same PostgreSQL object** in differently named migration files. This tool compares the SQL DDL *object identities* from **PR-specific changed migration patches**, reporting potential competing table/view/materialized-view definitions, function/procedure overloads, and table-scoped policies/triggers. This check prevents silent ownership ambiguity; it does not assert that both statements would execute or are incompatible.

## Offline usage

```bash
node --test scripts/audit-v3-world-sql-authority-collisions.test.mjs
node scripts/audit-v3-world-sql-authority-collisions.mjs --input world-pr-ddl-snapshot.json --require-clean
```

Example snapshot (supply actual PR-specific changed SQL files and exact current heads, *not entire inherited branch trees*):

```json
{
  "schemaVersion": 1,
  "candidates": [
    {
      "pr": 1001,
      "headSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "migrations": [
        {
          "path": "supabase/migrations/20261107010100_world_foo.sql",
          "source": "CREATE TABLE public.world_foo (id uuid primary key);"
        }
      ]
    },
    {
      "pr": 1002,
      "headSha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "migrations": [
        {
          "path": "supabase/migrations/20261107010200_world_other.sql",
          "source": "CREATE TABLE world_foo (id uuid primary key);"
        }
      ]
    }
  ]
}
```

A report includes a normalized object identity, PR number, exact supplied head SHA, SQL path, source line, and all producer occurrences. `--require-clean` exits **2** when review collisions exist, **1** when the input/parser fails, and **0** when no observed collisions exist. Omit it for advisory JSON-only output; `--json-output <path>` saves the report.

## Boundaries and safe integration

- This lexical source analyzer ignores SQL comments, text literals, nested comments and dollar-quoted function bodies. It does **not** execute SQL, inspect RLS/grants/SECURITY DEFINER, resolve unqualified identifiers against actual `search_path`, analyze dynamic DDL or check `ALTER`, `DROP`, `GRANT` or `REVOKE`. Unqualified names are assumed to use `public` **for advisory matching only**.
- Function identities use normalized input types; this is a best-effort lexical approximation of PostgreSQL overload identity and may conservatively flag false positives or miss unconventional type declarations. Validate findings with PostgreSQL before making decisions.
- The caller must construct a complete and fresh changed-patch snapshot. **The tool cannot itself prove patch completeness or the provenance of a claimed SHA**. A clean result does not prove no conflicts.
- For stacked PRs, compare only the SQL files actually added/changed in that child PR relative to its producer parent. Inherited files are not new ownership. Rebuild the snapshot if any PR head changes.
- This audit is complementary to separate branch/file conflicts, migration-version uniqueness, WORLD-01 S13/S16 authority, local-only PostgreSQL/RLS checks, exact-head CI, reviews, and WORLD-00 queue authorization. No automatic GitHub, network, Supabase, production or migration operations are performed.

**Operational order:** owners provide verified current PR-specific SQL patches → run tool in a local checkout (no secrets required) → discuss every reported cross-owner object → coordinate a single canonical owner → then run existing local migration and release gates. Do not treat zero findings as certification.
