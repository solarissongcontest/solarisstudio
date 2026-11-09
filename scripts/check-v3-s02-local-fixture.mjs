#!/usr/bin/env node
/**
 * S02 bounded fixture preflight. Operator-only, READ-ONLY catalog checks
 * against explicitly disposable loopback PostgreSQL. Never contact hosted
 * Supabase, replay historical migrations, or fabricate migration history.
 *
 * This is a prerequisite check, NOT hosted-equivalence certification.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELATIONS = [
  'private.v3_domain_event_outbox',
  'private.v3_domain_events',
  'private.v3_result_versions',
  'public.admin_notifications',
  'public.notification_deliveries',
  'public.studio2_edition_runtime',
  'public.studio2_operation_receipts',
  'public.studio2_organizer_tasks',
];
export const MISSING_S13_TABLES = [
  'private.v3_migration_contracts',
  'private.v3_schema_compatibility',
  'private.v3_schema_compatibility_history',
  'private.v3_backfill_jobs',
  'private.v3_migration_parity_runs',
];
export const MISSING_S13_FUNCTIONS = [
  'public.v3_schema_compatibility(integer)',
  'public.v3_register_migration_contract(text,integer,text,boolean,text,text)',
  'public.v3_claim_backfill(text,integer,integer,text,integer,bigint)',
  'public.v3_checkpoint_backfill(text,text,jsonb,integer,integer,text,boolean)',
  'public.v3_fail_backfill(text,text,text)',
  'public.v3_record_migration_parity(text,text,bigint,bigint,bigint,bigint,integer,jsonb)',
  'public.v3_set_schema_compatibility(integer,integer,integer,text,text,text)',
];
const S01_PATH = 'docs/v3/recovery-candidates/evidence/s01-hosted-source-delta-2026-11-09.json';

export function assertLocalEnvironment(env) {
  if (env.SOLARIS_S02_DISPOSABLE_CLUSTER !== 'YES' || env.SOLARIS_S02_TARGET !== 'local')
    throw Error('FAIL CLOSED: explicit disposable LOCAL opt-in required');
  const port = env.SOLARIS_S02_PGPORT;
  if (!/^\d{4,5}$/.test(port || '') || Number(port) < 1024 || Number(port) > 65535)
    throw Error('FAIL CLOSED: dedicated loopback PostgreSQL port required');
  for (const key of [
    'PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGSERVICE','PGSERVICEFILE',
    'DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','SUPABASE_URL',
    'VITE_SUPABASE_URL','E2E_SUPABASE_URL','VITE_CONFIRMATIONS_SUPABASE_URL',
    'CONFIRMATIONS_SUPABASE_URL','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD',
    'SUPABASE_SERVICE_ROLE_KEY','PGPASSWORD',
  ]) {
    if (env[key]) throw Error('FAIL CLOSED: inherited DB URL/credential/connection alias ' + key);
  }
  return port;
}

function completeMap(map, names, field) {
  if (!map || Array.isArray(map) || typeof map !== 'object' ||
      JSON.stringify(Object.keys(map).sort()) !== JSON.stringify([...names].sort()))
    throw Error('FAIL CLOSED: incomplete or extra ' + field + ' catalog objects');
  for (const name of names)
    if (typeof map[name] !== 'boolean')
      throw Error('FAIL CLOSED: unknown ' + field + ' catalog object ' + name);
}

export function validateManifest(manifest, s01) {
  if (!manifest || manifest.formatVersion !== 1 ||
      manifest.fixtureClass !== 'sanitized-hosted-frontier-s13-s14' ||
      manifest.schemaOnly !== true || manifest.containsProductionRows !== false ||
      manifest.containsProductionSecrets !== false ||
      manifest.reconstruction !== 'operator-reviewed-hosted-schema' ||
      manifest.cleanSourceReplay !== false)
    throw Error('FAIL CLOSED: fixture input cannot establish hosted-schema provenance');
  if (manifest.hostedHead !== '20261101181812' ||
      manifest.cutover !== '20261014020000' ||
      manifest.s01SourceSha !== s01.sourceMainSha ||
      s01.frontier.hostedHead !== manifest.hostedHead ||
      s01.frontier.immutableCutover !== manifest.cutover ||
      s01.frontier.postCutoverHistoryHoles !== 36 ||
      s01.frontier.sourcePendingAfterHead !== 33)
    throw Error('FAIL CLOSED: dated S01 migration frontier changed; refresh evidence');
  if (!/^[a-f0-9]{64}$/.test(manifest.sanitizedSchemaSha256 || '') ||
      !Array.isArray(manifest.unknownRequiredObjects) || manifest.unknownRequiredObjects.length ||
      manifest.postgresMajor !== 16)
    throw Error('FAIL CLOSED: missing schema fingerprint, PG16, or unknown required object');
  if (typeof manifest.coverageReview !== 'string' ||
      !manifest.coverageReview.startsWith('S13/S14 independently reviewed:'))
    throw Error('FAIL CLOSED: required-catalog coverage not attested');
  completeMap(manifest.relations, RELATIONS, 'S14 relation');
  for (const name of RELATIONS)
    if (manifest.relations[name] !== true)
      throw Error('FAIL CLOSED: required relation missing ' + name);
  completeMap(manifest.s13Tables, MISSING_S13_TABLES, 'S13 table');
  completeMap(manifest.s13Functions, MISSING_S13_FUNCTIONS, 'S13 function');
  for (const name of MISSING_S13_TABLES)
    if (manifest.s13Tables[name] !== false)
      throw Error('FAIL CLOSED: S13 hosted-head table must be absent ' + name);
  for (const name of MISSING_S13_FUNCTIONS)
    if (manifest.s13Functions[name] !== false)
      throw Error('FAIL CLOSED: S13 hosted-head RPC must be absent ' + name);
  const scoped = s01.reviewedEffects.filter(
    row => row.section === 'catalog-object' || row.section === 'table-acl');
  const objects = scoped.filter(row => row.section === 'catalog-object');
  const grants = scoped.filter(row => row.section === 'table-acl');
  if (objects.length !== 10 || grants.length !== 4 ||
      new Set(scoped.map(row => row.id)).size !== 14)
    throw Error('FAIL CLOSED: S01 catalog observation identities changed');
  completeMap(manifest.namedObjects, objects.map(row => row.id), 'named');
  completeMap(manifest.privileges, grants.map(row => row.id), 'ACL');
  for (const row of scoped) {
    const expected = row.current_evidence_classification === 'present';
    const actual = row.section === 'catalog-object'
      ? manifest.namedObjects[row.id] : manifest.privileges[row.id];
    if (!['present','absent'].includes(row.current_evidence_classification) ||
        actual !== expected)
      throw Error('FAIL CLOSED: unknown or changed S01 catalog object ' + row.id);
  }
  return true;
}

export function catalogQueries(manifest) {
  const lit = s => "'" + s.replaceAll("'", "''") + "'";
  const queries = [];
  for (const name of RELATIONS) queries.push([
    'select to_regclass(' + lit(name) + ') is not null', true, name]);
  for (const name of MISSING_S13_TABLES) queries.push([
    'select to_regclass(' + lit(name) + ') is not null', false, name]);
  for (const name of MISSING_S13_FUNCTIONS) queries.push([
    'select to_regprocedure(' + lit(name) + ') is not null', false, name]);
  for (const [identity, expected] of Object.entries(manifest.namedObjects)) {
    const [relation, name] = identity.split('/');
    const [schema, table] = relation.split('.');
    const index = name.endsWith('_idx');
    const statement = index
      ? 'select exists(select 1 from pg_index i join pg_class c on c.oid=i.indrelid join pg_class x on x.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=' + lit(schema) + ' and c.relname=' + lit(table) + ' and x.relname=' + lit(name) + ')'
      : 'select exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=' + lit(schema) + ' and c.relname=' + lit(table) + ' and t.tgname=' + lit(name) + ' and not t.tgisinternal)';
    queries.push([statement, expected, identity]);
  }
  for (const [identity, expected] of Object.entries(manifest.privileges)) {
    const [relation, role, action] = identity.split('/');
    queries.push(['select has_table_privilege(' + lit(role) + ',' +
      lit(relation) + ',' + lit(action) + ')', expected, identity]);
  }
  queries.push([
    "select relrowsecurity from pg_class where oid='public.notification_deliveries'::regclass",
    true, 'notification_deliveries RLS enabled']);
  return queries;
}

export function verifyCatalog(manifest, query) {
  const verified = [];
  for (const [sql, expected, id] of catalogQueries(manifest)) {
    const result = query(sql);
    if (result !== (expected ? 't' : 'f'))
      throw Error('FAIL CLOSED: required catalog state unknown/mismatched ' + id);
    verified.push(id);
  }
  const pgVersion = query('show server_version_num');
  if (!/^16\d{4}$/.test(pgVersion))
    throw Error('FAIL CLOSED: fixture must use PostgreSQL 16');
  return { postgresVersion: pgVersion, verifiedCatalogCount: verified.length };
}

export function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 6 || args[0] !== '--manifest' ||
      args[2] !== '--schema' || args[4] !== '--proof')
    throw Error('Usage: node scripts/check-v3-s02-local-fixture.mjs --manifest manifest.json --schema reviewed-schema.sql --proof proof.json');
  const port = assertLocalEnvironment(env);
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const s01 = JSON.parse(readFileSync(resolve(root, S01_PATH), 'utf8'));
  const manifest = JSON.parse(readFileSync(resolve(args[1]), 'utf8'));
  validateManifest(manifest, s01);
  const schema = readFileSync(resolve(args[3]));
  if (createHash('sha256').update(schema).digest('hex') !== manifest.sanitizedSchemaSha256)
    throw Error('FAIL CLOSED: reviewed sanitized-schema input fingerprint mismatch');
  // The schema must have been imported by the operator into a disposable PG16
  // instance. This read-only gate intentionally does not execute arbitrary SQL.
  const psqlEnv = {
    PATH: env.PATH || '/usr/bin:/bin', HOME: env.HOME || '/tmp',
    PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: port,
    PGDATABASE: 'postgres', PGUSER: 'postgres', PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '3', PGPASSWORD: 'postgres',
  };
  const query = sql => execFileSync('psql', [
    '-w','-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1',
    '-p',port,'-U','postgres','-d','postgres','-c',sql,
  ], { env: psqlEnv, timeout: 15000, encoding: 'utf8',
    stdio: ['ignore','pipe','pipe'] }).trim();
  const checked = verifyCatalog(manifest, query);
  const proof = {
    task: 'S02', status: 'SCOPED_CATALOG_PROOF_ONLY',
    sourceEvidenceSha: manifest.s01SourceSha, hostedHead: manifest.hostedHead,
    cutover: manifest.cutover, schemaSha256: manifest.sanitizedSchemaSha256,
    environment: 'disposable-loopback-postgresql:' + port, ...checked,
    fullHostedEquivalenceCertified: false, productionDeploymentAuthorized: false,
    rowUpgradeProven: false,
    limitation: 'Known S01/S13/S14 catalog subset only; requires separately verified sanitized hosted-head reconstruction and S14 upgrade rehearsal',
  };
  writeFileSync(resolve(args[5]), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
  console.log('PASS: ' + checked.verifiedCatalogCount + ' explicit local catalog assertions (NOT full hosted equivalence)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
