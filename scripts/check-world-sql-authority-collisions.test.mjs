import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSnapshot, sqlDeclarations } from './check-world-sql-authority-collisions.mjs';

const sha = c => c.repeat(40);
const file = (path, content) => ({ path: `supabase/migrations/${path}.sql`, content });
const snapshot = (a, b) => ({ mainSha: sha('0'), prs: [
  { number: 1890, headSha: sha('a'), files: a },
  { number: 2413, headSha: sha('b'), files: b },
] });

test('finds same canonical TG4 tables introduced by independent migration names', () => {
  const report = auditSnapshot(snapshot([file('old', 'create table public.world_documents (id uuid primary key, record_class text);')], [file('new', 'CREATE TABLE IF NOT EXISTS public.world_documents (id uuid primary key);')]));
  assert.equal(report.collisions.length, 1);
  assert.equal(report.collisions[0].object, 'table:public.world_documents');
  assert.equal(report.collisions[0].classification, 'different-source-review');
  assert.equal(report.collisions[0].initialTableColumnComparison.differingColumnSets, true);
  const newer = report.collisions[0].initialTableColumnComparison.observations.find(x => x.number === 2413);
  assert.deepEqual(newer.absentFromInitialDefinition, ['record_class']);
});

test('finds the colliding legal archive RPC signature despite different argument names', () => {
  const old = 'create or replace function public.world_get_public_legal_archive_v1(p_org text, p_doc text, p_before integer default null, p_limit integer default 30) returns jsonb language sql as $$ select null::jsonb $$;';
  const newer = 'CREATE FUNCTION public.world_get_public_legal_archive_v1(p_organization text,p_document text,p_cursor int4,p_limit int4) RETURNS jsonb language sql AS $$SELECT null::jsonb$$;';
  const report = auditSnapshot(snapshot([file('old', old)], [file('new', newer)]));
  assert.equal(report.collisions[0].object, 'function:public.world_get_public_legal_archive_v1(text,text,int4,int4)');
});

test('normalizes arbitrary SQL argument names rather than only p_* conventions', () => {
  const old = 'CREATE FUNCTION public.fn(organization text, document text, before_version integer) RETURNS void AS $$ SELECT NULL $$ LANGUAGE sql;';
  const newer = 'CREATE FUNCTION public.fn(p_org text, doc_slug text, p_before int4) RETURNS void AS $$ SELECT NULL $$ LANGUAGE sql;';
  const report = auditSnapshot(snapshot([file('a', old)], [file('b', newer)]));
  assert.equal(report.collisions[0].object, 'function:public.fn(text,text,int4)');
});

test('distinguishes distinct overloads', () => {
  const report = auditSnapshot(snapshot([file('a', 'CREATE FUNCTION public.f(p_x uuid) RETURNS uuid AS $$ SELECT null::uuid $$ LANGUAGE sql;')], [file('b', 'CREATE FUNCTION public.f(p_x text) RETURNS text AS $$ SELECT null::text $$ LANGUAGE sql;')]));
  assert.equal(report.collisions.length, 0);
});

test('ignores SQL comments, string literals, and dollar-quoted function bodies', () => {
  const source = `-- CREATE TABLE public.hidden(id int);\n/* CREATE TABLE public.also_hidden(id int); */\nCREATE FUNCTION public.real(p_input text DEFAULT 'CREATE TABLE public.not_real') RETURNS void AS $fn$\nBEGIN\n  EXECUTE 'CREATE TABLE public.body_only(id int)';\nEND;\n$fn$ LANGUAGE plpgsql;`;
  const names = sqlDeclarations(source).map(x => x.name);
  assert.deepEqual(names, ['public.real']);
});

test('identical stacked migration source is classified for review, not incorrectly declared incompatible', () => {
  const sql = 'CREATE TABLE public.world_document_versions(id uuid);';
  const report = auditSnapshot(snapshot([file('a', sql)], [file('a', sql)]));
  assert.equal(report.collisions[0].classification, 'identical-source-review');
});

test('repeated definitions inside one PR are not cross-PR collisions', () => {
  const report = auditSnapshot({ mainSha: sha('0'), prs: [{ number: 1, headSha: sha('a'), files: [file('a', 'CREATE TABLE public.world_documents(id uuid);'), file('b', 'CREATE TABLE public.world_documents(id uuid);')] }] });
  assert.deepEqual(report.collisions, []);
});

test('fails closed on missing heads, duplicate PRs, or incomplete SQL source', () => {
  assert.throws(() => auditSnapshot({ mainSha: 'main', prs: [] }), /mainSha/);
  assert.throws(() => auditSnapshot({ mainSha: sha('0'), prs: [{ number: 1, headSha: 'head', files: [] }] }), /Invalid/);
  assert.throws(() => auditSnapshot({ mainSha: sha('0'), prs: [{ number: 1, headSha: sha('a'), files: [{path:'supabase/migrations/a.sql'}] }] }), /Invalid migration/);
  assert.throws(() => auditSnapshot({ mainSha: sha('0'), prs: [
    { number: 1, headSha: sha('a'), files: [] }, { number: 1, headSha: sha('b'), files: [] },
  ] }), /duplicate PR/);
});

test('unterminated SQL literal cannot silently produce a clean report', () => {
  assert.throws(() => sqlDeclarations("CREATE FUNCTION public.fn() RETURNS void AS $abc$select 1;"), /Unterminated/);
});


test('nested type/DEFAULT commas and table constraints do not become phantom columns', () => {
  const old = `CREATE TABLE public.legal (id uuid PRIMARY KEY,
    amount numeric(10, 2) DEFAULT round(1.2, 1), title text NOT NULL,
    CONSTRAINT legal_title_check CHECK (length(title) > 1));`;
  const newer = `CREATE TABLE IF NOT EXISTS public.legal (
    id uuid PRIMARY KEY, amount numeric(10,2), title text NOT NULL,
    legacy_class text DEFAULT 'public', UNIQUE (id, title));`;
  const report = auditSnapshot(snapshot([file('old', old)], [file('new', newer)]));
  assert.equal(report.collisions.length, 1);
  const oldShape = report.collisions[0].initialTableColumnComparison.observations.find(x => x.number === 1890);
  assert.deepEqual(oldShape.initialColumns, ['amount', 'id', 'title']);
  assert.deepEqual(oldShape.absentFromInitialDefinition, ['legacy_class']);
});

test('identical initial columns are not falsely called different when constraints change', () => {
  const report = auditSnapshot(snapshot(
    [file('a', 'CREATE TABLE public.legal (id uuid PRIMARY KEY, title text NOT NULL);')],
    [file('b', 'CREATE TABLE public.legal (title text, id uuid);')],
  ));
  assert.equal(report.collisions[0].initialTableColumnComparison.differingColumnSets, false);
});

test('CREATE TABLE AS has no invented column comparison', () => {
  const report = auditSnapshot(snapshot(
    [file('a', 'CREATE TABLE public.report AS SELECT 1 AS count;')],
    [file('b', 'CREATE TABLE public.report(id bigint);')],
  ));
  assert.equal(report.collisions[0].initialTableColumnComparison, null);
});
