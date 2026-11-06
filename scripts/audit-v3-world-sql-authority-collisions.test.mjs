import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractSqlObjects, auditWorldSqlAuthorities } from './audit-v3-world-sql-authority-collisions.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40);
const patch = (pr, headSha, source, name = 'source') => ({
  pr, headSha, migrations: [{path: 'supabase/migrations/20261107001000_' + name + '.sql', source}]
});
const snapshot = (...candidates) => ({schemaVersion: 1, candidates});

test('ignores comments, string literals, nested comments and dollar-quoted function body', () => {
  const source = "-- CREATE TABLE private.false(x int);\n" +
    "/* outer /* CREATE VIEW private.fake AS SELECT 1 */ outer */\n" +
    "CREATE FUNCTION public.real(p_id uuid) RETURNS void AS $body$ BEGIN RAISE NOTICE 'CREATE TABLE bad'; END; $body$ LANGUAGE plpgsql;";
  assert.deepEqual(extractSqlObjects(source).map(x => x.identity), ['routine:public.real(uuid)']);
});

test('cross-PR object collision detects different filenames and versions', () => {
  const report = auditWorldSqlAuthorities(snapshot(
    patch(1890, A, 'CREATE TABLE public.world_resolutions(id uuid);'),
    patch(2245, B, 'CREATE TABLE IF NOT EXISTS world_resolutions(id uuid);', 'second'),
  ));
  assert.equal(report.clean, false);
  assert.equal(report.collisionCount, 1);
  assert.equal(report.collisions[0].identity, 'relation:public.world_resolutions');
  assert.deepEqual(report.collisions[0].occurrences.map(x => x.pr), [1890, 2245]);
});

test('routine identity normalizes optional names, type aliases and defaults', () => {
  const report = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE OR REPLACE FUNCTION private.vote(actor uuid, limit_count int4 DEFAULT 0, notes varchar(32), payload jsonb[]) RETURNS jsonb AS $$ SELECT NULL $$ LANGUAGE sql;'),
    patch(2, B, 'CREATE FUNCTION private.vote(uuid, integer, character varying, jsonb[]) RETURNS jsonb AS $$ SELECT NULL $$ LANGUAGE sql;', 'other')
  ));
  assert.deepEqual(report.collisions.map(x => x.identity),
    ['routine:private.vote(uuid,integer,character varying,jsonb[])']);
});

test('OUT-only argument does not change input overload identity', () => {
  const report = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE FUNCTION world_result(p_id uuid, OUT p_value text) RETURNS record AS $$ SELECT NULL $$ LANGUAGE sql;'),
    patch(2, B, 'CREATE PROCEDURE public.world_result(id uuid) LANGUAGE sql AS $$ SELECT NULL $$;', 'procedure')
  ));
  assert.equal(report.collisionCount, 1);
});

test('routine overload by actual input type is not a collision', () => {
  const report = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE FUNCTION world_result(p_id uuid) RETURNS void AS $$ SELECT NULL $$ LANGUAGE sql;'),
    patch(2, B, 'CREATE FUNCTION world_result(p_id text) RETURNS void AS $$ SELECT NULL $$ LANGUAGE sql;', 'overload')
  ));
  assert.equal(report.clean, true);
});

test('relations share namespace across table, view and materialized view', () => {
  const report = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE MATERIALIZED VIEW world_history AS SELECT 1;'),
    patch(2, B, 'CREATE TABLE public.world_history(id bigint);', 'table')
  ));
  assert.equal(report.collisions[0].identity, 'relation:public.world_history');
});

test('policy and trigger names are scoped to their table', () => {
  const report = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE POLICY members ON public.world_votes USING (true); CREATE TRIGGER audit BEFORE INSERT ON public.world_votes FOR EACH ROW EXECUTE FUNCTION foo();'),
    patch(2, B, 'CREATE POLICY members ON world_votes USING (false); CREATE TRIGGER audit AFTER UPDATE ON world_votes FOR EACH ROW EXECUTE FUNCTION foo();', 'alternate')
  ));
  assert.deepEqual(report.collisions.map(x => x.identity),
    ['policy:public.world_votes/members', 'trigger:public.world_votes/audit']);
  const distinct = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE POLICY members ON world_votes USING (true);'),
    patch(2, B, 'CREATE POLICY members ON world_sessions USING (true);', 'other')
  ));
  assert.equal(distinct.clean, true);
});

test('quoted mixed-case names are distinct; quoted lowercase matches plain lowercase', () => {
  const distinct = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE TABLE public."World_Cases"(id uuid);'),
    patch(2, B, 'CREATE TABLE public.world_cases(id uuid);', 'other')
  ));
  assert.equal(distinct.clean, true);
  const matching = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE TABLE "world_cases"(id uuid);'),
    patch(2, B, 'CREATE TABLE world_cases(id uuid);', 'other')
  ));
  assert.equal(matching.collisionCount, 1);
});

test('redefinitions within the same PR are not reported as cross-PR collisions', () => {
  const a = patch(1, A, 'CREATE FUNCTION f(uuid) RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;');
  a.migrations.push({path: 'supabase/migrations/20261107002000_redefinition.sql',
    source: 'CREATE OR REPLACE FUNCTION f(uuid) RETURNS int AS $$ SELECT 2 $$ LANGUAGE sql;'});
  assert.equal(auditWorldSqlAuthorities(snapshot(a)).clean, true);
});

test('incomplete, malformed or unclosed SQL inputs fail closed', () => {
  assert.throws(() => auditWorldSqlAuthorities(snapshot()), /1–100/);
  assert.throws(() => auditWorldSqlAuthorities(snapshot(patch(1, 'short', 'CREATE TABLE f(x int);'))), /head SHA/);
  const unsafe = patch(1, A, 'CREATE TABLE f(x int);');
  unsafe.migrations[0].path = '../foo.sql';
  assert.throws(() => auditWorldSqlAuthorities(snapshot(unsafe)), /migration path/);
  assert.throws(() => extractSqlObjects('CREATE FUNCTION f() AS $body$ unfinished'), /Unclosed SQL dollar/);
  assert.throws(() => extractSqlObjects('/* unfinished'), /Unclosed SQL block/);
});

test('actual CLI returns 2 for collision under require-clean and emits valid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'world-ddl-'));
  try {
    const input = join(dir, 'sample.json');
    writeFileSync(input, JSON.stringify(snapshot(
      patch(1, A, 'CREATE TABLE world_dup(x uuid);'),
      patch(2, B, 'CREATE TABLE public.world_dup(x uuid);', 'second')
    )));
    const path = fileURLToPath(new URL('./audit-v3-world-sql-authority-collisions.mjs', import.meta.url));
    const strict = spawnSync(process.execPath, [path, '--input', input, '--require-clean'], {encoding: 'utf8'});
    assert.equal(strict.status, 2, strict.stderr);
    assert.equal(JSON.parse(strict.stdout).collisionCount, 1);
    const advisory = spawnSync(process.execPath, [path, '--input', input], {encoding: 'utf8'});
    assert.equal(advisory.status, 0, advisory.stderr);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});


test('INOUT participates in input identity rather than disappearing like OUT', () => {
  const report = auditWorldSqlAuthorities(snapshot(
    patch(1, A, 'CREATE FUNCTION public.world_member(INOUT member_id uuid) LANGUAGE sql AS $$ SELECT NULL $$;'),
    patch(2, B, 'CREATE FUNCTION public.world_member(actor uuid) RETURNS void AS $$ SELECT NULL $$ LANGUAGE sql;', 'same_signature')
  ));
  assert.equal(report.collisionCount, 1);
  assert.equal(report.collisions[0].identity, 'routine:public.world_member(uuid)');
});
