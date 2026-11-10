import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSchemaToc } from './v3-s06-schema-toc-preflight.mjs';

const header = '; Archive created at 2026-11-10\n; Format: CUSTOM\n; Dumped from database version: 17.11\n; Dumped by pg_dump version: 17.11\n';
const tableA = '11; 1259 100 TABLE auth users supabase_auth_admin\n';
const tableB = '12; 1259 101 TABLE public countries postgres\n';
const policy = '13; 3256 102 POLICY public countries public_read postgres\n';
const toc = header + tableA + tableB + policy;
const ids = ['auth.users', 'public.countries'];

test('offline exact table TOC identity match is only a preliminary non-certification', () => {
  const result = inspectSchemaToc(toc, ids);
  assert.equal(result.status, 'TOC_SCHEMA_ONLY_PREFLIGHT_NOT_CERTIFIED');
  assert.equal(result.tocTableIdentitiesMatched, 2);
  assert.equal(result.tocObjectEntries, 3);
  assert.equal(result.dataBearingTocEntries, 0);
  assert.equal(result.fullHostedEquivalenceCertified, false);
  assert.equal(result.productionSqlExecutedByThisChecker, false);
  assert.match(result.tocSha256, /^[a-f0-9]{64}$/);
});

test('missing relation refuses before any positive proof', () => {
  assert.throws(() => inspectSchemaToc(header + tableA, ids), /missing=1/);
});

test('unexpected relation and duplicates refuse', () => {
  assert.throws(() => inspectSchemaToc(toc, ['auth.users']), /unexpected=1/);
  assert.throws(() => inspectSchemaToc(toc + tableB, ids), /duplicate table/);
});

test('data-bearing TOC entries fail closed even when schemas match', () => {
  const extras = [
    '44; 0 201 TABLE DATA public countries postgres\n',
    '45; 0 202 SEQUENCE SET public countries_id_seq postgres\n',
    '46; 0 203 MATERIALIZED VIEW DATA public summary postgres\n',
    '47; 0 204 BLOBS - BLOBS postgres\n'
  ];
  for (const extra of extras) {
    assert.throws(() => inspectSchemaToc(toc + extra, ids), /data-bearing/);
  }
});

test('wrong version, non-custom dump, no entries, untrusted expected inputs refuse', () => {
  assert.throws(() => inspectSchemaToc(toc.replace('17.11', '16.9'), ids), /17\.11/);
  assert.throws(() => inspectSchemaToc(toc.replace('Format: CUSTOM', 'Format: PLAIN'), ids), /custom-format/);
  assert.throws(() => inspectSchemaToc(header, ids), /no schema objects/);
  assert.throws(() => inspectSchemaToc(toc, ['auth.users', 'auth.users']), /duplicate/);
  assert.throws(() => inspectSchemaToc(toc + 'CREATE TABLE hacked (x int);', ids), /unexpected TOC/);
});

test('never treat a fingerprint or TOC alone as an executed S13-S14 recovery test', () => {
  const result = inspectSchemaToc(toc, ids);
  assert.equal(result.reviewerApprovalOutstanding, true);
  assert.ok(result.missingIndependentProof.some(x => /isolated PG17.11 import/.test(x)));
  assert.ok(result.missingIndependentProof.some(x => /synthetic/.test(x)));
});
