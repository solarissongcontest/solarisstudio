import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RELATIONS, MISSING_S13_TABLES, MISSING_S13_FUNCTIONS,
  assertLocalEnvironment, validateManifest, catalogQueries, verifyCatalog,
} from './check-v3-s02-local-fixture.mjs';

const s01 = JSON.parse(readFileSync(
  new URL('../docs/v3/recovery-candidates/evidence/s01-hosted-source-delta-2026-11-09.json', import.meta.url),
  'utf8',
));
const subset = s01.reviewedEffects.filter(row =>
  row.section === 'catalog-object' || row.section === 'table-acl');
const named = subset.filter(row => row.section === 'catalog-object');
const acl = subset.filter(row => row.section === 'table-acl');

function fixture() {
  return {
    formatVersion: 1,
    fixtureClass: 'sanitized-hosted-frontier-s13-s14',
    schemaOnly: true,
    containsProductionRows: false,
    containsProductionSecrets: false,
    reconstruction: 'operator-reviewed-hosted-schema',
    cleanSourceReplay: false,
    hostedHead: '20261101181812',
    cutover: '20261014020000',
    s01SourceSha: s01.sourceMainSha,
    postgresMajor: 16,
    sanitizedSchemaSha256: 'a'.repeat(64),
    unknownRequiredObjects: [],
    coverageReview: 'S13/S14 independently reviewed: test-only scoped evidence',
    relations: Object.fromEntries(RELATIONS.map(x => [x, true])),
    s13Tables: Object.fromEntries(MISSING_S13_TABLES.map(x => [x, false])),
    s13Functions: Object.fromEntries(MISSING_S13_FUNCTIONS.map(x => [x, false])),
    namedObjects: Object.fromEntries(named.map(x => [x.id, x.current_evidence_classification === 'present'])),
    privileges: Object.fromEntries(acl.map(x => [x.id, x.current_evidence_classification === 'present'])),
  };
}

describe('S02 local hosted-frontier proof (offline negative checks)', () => {
  it('requires exact S01 frontier, all scoped identities, no unknown objects', () => {
    const manifest = fixture();
    expect(validateManifest(manifest, s01)).toBe(true);
    expect(subset).toHaveLength(14);
    const queries = catalogQueries(manifest);
    expect(queries).toHaveLength(35); // 8 relations + 5 absent S13 tables + 7 absent RPC + 10 named + 4 grants + RLS
    const expected = new Map(queries.map(([query, state]) => [query, state ? 't' : 'f']));
    const proof = verifyCatalog(manifest, sql =>
      sql === 'show server_version_num' ? '160011' : expected.get(sql));
    expect(proof).toEqual({ postgresVersion: '160011', verifiedCatalogCount: 35 });
  });

  it('rejects unknown required objects and all missing/extra expected identities', () => {
    const changes = [
      m => m.unknownRequiredObjects.push('public.unreviewed(uuid)'),
      m => delete m.relations['private.v3_result_versions'],
      m => { m.relations['private.extra'] = false; },
      m => { m.s13Tables['private.v3_backfill_jobs'] = null; },
      m => { m.s13Functions[MISSING_S13_FUNCTIONS[0]] = true; },
      m => { m.namedObjects[named[0].id] = false; },
      m => { m.privileges[acl[0].id] = false; },
      m => { m.coverageReview = 'unchecked'; },
    ];
    for (const change of changes) {
      const manifest = fixture(); change(manifest);
      expect(() => validateManifest(manifest, s01)).toThrow(/FAIL CLOSED/);
    }
  });

  it('does not accept clean replay, hosted rows, secrets, PG17, or stale S01', () => {
    const changes = [
      m => { m.cleanSourceReplay = true; },
      m => { m.reconstruction = 'source-clean'; },
      m => { m.containsProductionRows = true; },
      m => { m.containsProductionSecrets = true; },
      m => { m.s01SourceSha = 'stale'; },
      m => { m.hostedHead = '20261109000000'; },
      m => { m.postgresMajor = 17; },
      m => { m.sanitizedSchemaSha256 = 'missing'; },
    ];
    for (const change of changes) {
      const manifest = fixture(); change(manifest);
      expect(() => validateManifest(manifest, s01)).toThrow(/FAIL CLOSED/);
    }
  });

  it('refuses hosted env aliases, implicit targets and non-loopback connection settings', () => {
    const safe = { SOLARIS_S02_DISPOSABLE_CLUSTER: 'YES',
      SOLARIS_S02_TARGET: 'local', SOLARIS_S02_PGPORT: '54399' };
    expect(assertLocalEnvironment(safe)).toBe('54399');
    for (const alias of ['SUPABASE_URL','VITE_SUPABASE_URL','E2E_SUPABASE_URL',
      'DATABASE_URL','POSTGRES_URL','SUPABASE_DB_URL','PGHOST','PGHOSTADDR',
      'PGPORT','PGSERVICE','SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','PGPASSWORD']) {
      expect(() => assertLocalEnvironment({ ...safe, [alias]: 'https://host.invalid' }))
        .toThrow(/FAIL CLOSED/);
    }
    expect(() => assertLocalEnvironment({ ...safe, SOLARIS_S02_TARGET: 'hosted' })).toThrow();
    expect(() => assertLocalEnvironment({ ...safe, SOLARIS_S02_PGPORT: '54399;evil' })).toThrow();
    expect(() => assertLocalEnvironment({ ...safe, SOLARIS_S02_DISPOSABLE_CLUSTER: 'NO' })).toThrow();
  });

  it('rejects live catalog drift, absent hosted guard, and wrong PostgreSQL major', () => {
    const manifest = fixture();
    const queries = catalogQueries(manifest);
    const good = new Map(queries.map(([sql, expected]) => [sql, expected ? 't' : 'f']));
    const guard = queries.find(([, , id]) => id === 'public.admin_notifications/studio2_platform_direct_write_guard');
    expect(guard).toBeDefined();
    expect(guard[1]).toBe(true);
    expect(() => verifyCatalog(manifest, sql =>
      sql === guard[0] ? 'f' : sql === 'show server_version_num' ? '160011' : good.get(sql)))
      .toThrow(/FAIL CLOSED.*admin_notifications/);
    expect(() => verifyCatalog(manifest, sql =>
      sql === 'show server_version_num' ? '150009' : good.get(sql)))
      .toThrow(/PostgreSQL 16/);
    expect(() => verifyCatalog(manifest, sql =>
      sql === queries[0][0] ? '' : sql === 'show server_version_num' ? '160011' : good.get(sql)))
      .toThrow(/unknown\/mismatched/);
  });
});
