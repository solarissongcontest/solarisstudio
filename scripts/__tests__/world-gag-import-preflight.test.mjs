import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, validateGagManifest } from '../world-gag-import-preflight.mjs';

const source = Buffer.from('TEST FIXTURE ONLY; not a historical document.');
const digest = createHash('sha256').update(source).digest('hex');
const original = () => ({
  schemaVersion: 1,
  source: {
    documentId: 'TEST-ONLY', documentSha256: digest,
    citation: 'Local fabricated test fixture, NOT an official source',
    verifiedAt: '2026-11-07T00:00:00Z',
  },
  records: [
    { identifier: 'EXAMPLE 001', outcome: null, sourceLocator: 'example page 1', textAvailability: 'unavailable' },
  ],
});
const check = (manifest, bytes = source) => validateGagManifest(manifest, bytes, Buffer.from(JSON.stringify(manifest)));
const fails = (modify, pattern) => { const m = original(); modify(m); assert.throws(() => check(m), pattern); };

test('verified source, unknown outcome and unavailable text remain explicit; no import receipt', () => {
  const report = check(original());
  assert.equal(report.status, 'source_checked_not_imported');
  assert.equal(report.recordCount, 1);
  assert.deepEqual(report.records[0], {
    identifier: 'EXAMPLE 001', outcome: null, sourceLocator: 'example page 1', textAvailability: 'unavailable',
    titleProvided: false, sponsorProvided: false, fullTextProvided: false,
  });
  assert.equal(report.source.documentSha256, digest);
  assert.equal('importedAt' in report, false);
  assert.equal('title' in report.records[0], false);
});

test('fail closed if source bytes differ even when manifest is well formed', () => {
  assert.throws(() => check(original(), Buffer.from('modified')), /source file differs/);
});

test('reject unsourced title/sponsor and stray source pointers', () => {
  fails(m => { m.records[0].title = 'Assumed Title'; }, /titleSourceLocator/);
  fails(m => { m.records[0].sponsor = 'Assumed Sponsor'; }, /sponsorSourceLocator/);
  fails(m => { m.records[0].titleSourceLocator = 'p.1'; }, /has no title/);
});

test('available full text must have exact source locator, unavailable must be absent', () => {
  fails(m => { m.records[0].textAvailability = 'available'; }, /available text requires/);
  fails(m => { m.records[0].fullText = 'Guess'; }, /fullTextSourceLocator/);
  fails(m => { m.records[0].fullText = 'Source text'; m.records[0].fullTextSourceLocator = 'p.1'; }, /unavailable text must be null/);
  const m = original();
  m.records[0].textAvailability = 'available';
  m.records[0].fullText = 'Source text';
  m.records[0].fullTextSourceLocator = 'page 1';
  assert.equal(check(m).records[0].fullTextProvided, true);
});

test('reject duplicates including unicode/case collisions, preserve exact identifiers', () => {
  fails(m => { m.records.push({ ...m.records[0], identifier: 'example 001' }); }, /duplicate or ambiguous/);
  fails(m => { m.records[0].identifier = ' EXAMPLE 001 '; }, /unmodified source text/);
  const m = original(); m.records[0].identifier = 'GAG-XVIII/Ä';
  assert.equal(check(m).records[0].identifier, 'GAG-XVIII/Ä');
});

test('no silent acceptance of unknown metadata, invalid UTC, empty records or false authority', () => {
  fails(m => { m.records[0].importedAt = 'yesterday'; }, /unexpected field/);
  fails(m => { m.source.databaseId = 'invented'; }, /unexpected field/);
  fails(m => { m.source.verifiedAt = '2026-02-30T00:00:00Z'; }, /valid explicit UTC/);
  fails(m => { m.records = []; }, /1 to 5000/);
  fails(m => { m.records[0].outcome = '  adopted'; }, /unmodified source text/);
});

test('CLI writes a strict private local report and refuses overwrites', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'world-gag-proof-'));
  try {
    const manifestFile = join(dir, 'manifest.json');
    const sourceFile = join(dir, 'document.txt');
    const reportFile = join(dir, 'report.json');
    await writeFile(manifestFile, JSON.stringify(original()));
    await writeFile(sourceFile, source);
    const result = await runCli(['--manifest', manifestFile, '--source', sourceFile, '--output', reportFile]);
    assert.equal(result.report.recordCount, 1);
    const report = JSON.parse(await readFile(reportFile, 'utf8'));
    assert.equal(report.status, 'source_checked_not_imported');
    await assert.rejects(runCli(['--manifest', manifestFile, '--source', sourceFile, '--output', reportFile]), /EEXIST/);
    await assert.rejects(runCli(['--manifest', manifestFile, '--source', join(dir, 'missing')]), /ENOENT/);
    const oversized = join(dir, 'oversized.bin');
    await writeFile(oversized, '');
    await truncate(oversized, 33 * 1024 * 1024);
    await assert.rejects(runCli(['--manifest', manifestFile, '--source', oversized]), /source must be a regular/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
