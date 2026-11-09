#!/usr/bin/env node
/**
 * S02 bounded fixture preflight. Operator-only, READ-ONLY catalog checks
 * against explicitly disposable loopback PostgreSQL. Never contact hosted
 * Supabase, replay historical migrations, or fabricate migration history.
 *
 * This is a prerequisite check, NOT hosted-equivalence certification.
 */
import { createHash, randomBytes } from 'node:crypto';
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
  for (const key of [
    'PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGSERVICE','PGSERVICEFILE',
    'DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','SUPABASE_URL',
    'VITE_SUPABASE_URL','E2E_SUPABASE_URL','VITE_CONFIRMATIONS_SUPABASE_URL',
    'CONFIRMATIONS_SUPABASE_URL','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD',
    'SUPABASE_SERVICE_ROLE_KEY','PGPASSWORD','SOLARIS_S02_PGPORT',
    'DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH',
    'DOCKER_CONFIG',
  ]) {
    if (env[key]) throw Error('FAIL CLOSED: inherited remote DB/Docker target or credential alias ' + key);
  }
  return 'disposable-docker-network-none';
}

export function assertIsolatedContainer(hostConfig, actualImage, reviewedImage) {
  if (!hostConfig || hostConfig.NetworkMode !== 'none' ||
      (hostConfig.PortBindings && Object.keys(hostConfig.PortBindings).length !== 0) ||
      !/^sha256:[a-f0-9]{64}$/.test(actualImage) ||
      actualImage !== reviewedImage)
    throw Error('FAIL CLOSED: Docker container must have no network or published ports and use the reviewed image');
  return true;
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
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.postgresImageId || '') ||
      !/^[a-f0-9]{64}$/.test(manifest.sanitizedSchemaSha256 || '') ||
      !Array.isArray(manifest.unknownRequiredObjects) || manifest.unknownRequiredObjects.length ||
      manifest.postgresMajor !== 16)
    throw Error('FAIL CLOSED: missing schema fingerprint, PG16, or unknown required object');
  if (typeof manifest.coverageReview !== 'string' ||
      !manifest.coverageReview.startsWith('S13/S14 independently reviewed:') ||
      typeof manifest.reconstructionReviewedBy !== 'string' ||
      manifest.reconstructionReviewedBy.trim().length < 3 ||
      typeof manifest.reconstructionReviewedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(manifest.reconstructionReviewedAt) ||
      !Array.isArray(manifest.assumptions) || !manifest.assumptions.length ||
      !manifest.assumptions.every(x => typeof x === 'string' && x.trim().length >= 8) ||
      !Array.isArray(manifest.limitations) || !manifest.limitations.length ||
      !manifest.limitations.every(x => typeof x === 'string' && x.trim().length >= 8))
    throw Error('FAIL CLOSED: fixture reconstruction coverage, reviewer, assumptions or limitations not attested');
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
      : 'select exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=' + lit(schema) + ' and c.relname=' + lit(table) + ' and t.tgname=' + lit(name) + ' and not t.tgisinternal' +
        (name === 'studio2_platform_direct_write_guard' ?
          " and t.tgenabled in ('O','A') and t.tgfoid=to_regprocedure('private.studio2_guard_direct_client_write()')" : '') + ')';
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

const DOCKER_SOCKET = 'unix:///var/run/docker.sock';
const DOCKER_IMAGE = 'postgres:16';

/**
 * Only the process-owned, isolated container can be queried. There is no
 * PostgreSQL port, DNS lookup, linked Supabase client or outbound network.
 */
export function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 6 || args[0] !== '--manifest' ||
      args[2] !== '--schema' || args[4] !== '--proof')
    throw Error('Usage: node scripts/check-v3-s02-local-fixture.mjs --manifest manifest.json --schema reviewed-schema.sql --proof proof.json');
  assertLocalEnvironment(env);
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const s01 = JSON.parse(readFileSync(resolve(root, S01_PATH), 'utf8'));
  const manifest = JSON.parse(readFileSync(resolve(args[1]), 'utf8'));
  validateManifest(manifest, s01);
  const schema = readFileSync(resolve(args[3]));
  if (createHash('sha256').update(schema).digest('hex') !== manifest.sanitizedSchemaSha256)
    throw Error('FAIL CLOSED: reviewed sanitized-schema input fingerprint mismatch');

  // Never inherit a Docker context/endpoint or any libpq connection identity.
  // Require a locally available PostgreSQL image, do not pull silently.
  const commandEnv = { PATH: env.PATH || '/usr/bin:/bin', HOME: env.HOME || '/tmp' };
  const docker = (argv, opts = {}) => execFileSync('docker',
    ['--host', DOCKER_SOCKET, ...argv], {
      env: commandEnv, timeout: opts.timeout || 60000,
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      ...(opts.input === undefined ? {} : { input: opts.input }),
    }).trim();
  const imageId = docker(['image', 'inspect', '--format', '{{.Id}}', DOCKER_IMAGE]);
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId) || imageId !== manifest.postgresImageId)
    throw Error('FAIL CLOSED: reviewed, immutable PostgreSQL image identity mismatch');
  const name = 'solaris-s02-' + process.pid + '-' + randomBytes(6).toString('hex');
  let containerId;
  let checked;
  let stopped = false;
  try {
    containerId = docker(['run', '-d', '--rm', '--pull=never', '--network=none',
      '--name', name, '-e', 'POSTGRES_PASSWORD=solaris_s02_disposable_only',
      DOCKER_IMAGE], { timeout: 120000 });
    if (!/^[a-f0-9]{64}$/.test(containerId))
      throw Error('FAIL CLOSED: isolated Docker container ID not returned');
    const config = JSON.parse(docker(['inspect', '--format', '{{json .HostConfig}}', containerId]));
    const activeImage = docker(['inspect', '--format', '{{.Image}}', containerId]);
    assertIsolatedContainer(config, activeImage, imageId);

    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        docker(['exec', containerId, 'pg_isready', '-h', '/var/run/postgresql', '-U', 'postgres'],
          { timeout: 10000 });
        ready = true;
        break;
      } catch {
        // Only retry on the explicitly owned container; never look up another DB.
        execFileSync('sleep', ['1'], { env: commandEnv, timeout: 2000 });
      }
    }
    if (!ready) throw Error('FAIL CLOSED: disposable PostgreSQL never became ready');

    // Exact reviewed DDL is imported into THIS isolated, empty container.
    // No volumes, external network, database URLs or production data.
    docker(['exec', '-i', containerId, 'psql', '-w', '-X', '-q',
      '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
      '--single-transaction', '-f', '-'],
      { input: schema, timeout: 180000 });

    const query = sql => docker(['exec', containerId, 'psql', '-w', '-X', '-qAt',
      '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql],
    { timeout: 15000 });
    checked = verifyCatalog(manifest, query);
    // Recheck container isolation AFTER schema import. SQL itself cannot
    // create a Docker network or published port on this isolated engine.
    const afterConfig = JSON.parse(docker(['inspect', '--format',
      '{{json .HostConfig}}', containerId]));
    const afterImage = docker(['inspect', '--format', '{{.Image}}', containerId]);
    assertIsolatedContainer(afterConfig, afterImage, imageId);
  } finally {
    if (containerId) {
      try {
        docker(['rm', '-f', containerId], { timeout: 30000 });
        stopped = true;
      } catch {
        // No positive proof if the disposable database could not be destroyed.
        throw Error('FAIL CLOSED: cleanup of the S02 disposable container failed');
      }
    }
  }
  if (!stopped || !checked)
    throw Error('FAIL CLOSED: fixture startup/import/catalog/cleanup incomplete');

  const proof = {
    task: 'S02', status: 'SCOPED_CATALOG_PROOF_ONLY',
    sourceEvidenceSha: manifest.s01SourceSha, hostedHead: manifest.hostedHead,
    cutover: manifest.cutover, schemaSha256: manifest.sanitizedSchemaSha256,
    reconstructionReviewedBy: manifest.reconstructionReviewedBy,
    reconstructionReviewedAt: manifest.reconstructionReviewedAt,
    reconstructionAssumptions: manifest.assumptions,
    reconstructionLimitations: manifest.limitations,
    environment: 'disposable-docker-network-none-unix-socket',
    dockerImage: DOCKER_IMAGE, dockerImageId: imageId,
    schemaImportedIntoVerifiedIsolatedContainer: true,
    containerRemovedBeforeProof: stopped, ...checked,
    fullHostedEquivalenceCertified: false, productionDeploymentAuthorized: false,
    rowUpgradeProven: false,
    limitation: 'Known S01/S13/S14 catalog subset only; requires independently reviewed sanitized hosted-head source and full S14 upgrade rehearsal',
  };
  writeFileSync(resolve(args[5]), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
  console.log('PASS: isolated schema import and ' + checked.verifiedCatalogCount +
    ' catalog assertions (NOT full hosted equivalence)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; }
}
