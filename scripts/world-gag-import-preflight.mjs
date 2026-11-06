#!/usr/bin/env node
/**
 * Terra Solaris TG17/TG19: offline, fail-closed source proof for historical GAG
 * manifests. This deliberately NEVER inserts, updates or publishes records.
 * Canonical TG7/TG9 owners decide how a validated source maps to live tables.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS = 5000;
const MANIFEST_KEYS = new Set(['schemaVersion', 'source', 'records']);
const SOURCE_KEYS = new Set(['documentId', 'documentSha256', 'citation', 'verifiedAt']);
const RECORD_KEYS = new Set([
  'identifier', 'outcome', 'sourceLocator', 'textAvailability', 'fullText',
  'fullTextSourceLocator', 'title', 'titleSourceLocator', 'sponsor', 'sponsorSourceLocator',
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function assertObject(value, context) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context}: must be an object`);
  }
}
function knownKeys(value, keys, context) {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`${context}: unexpected field ${JSON.stringify(key)}`);
  }
}
function exactText(value, context, max = 500) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${context}: expected nonempty, unmodified source text without control characters`);
  }
  return value;
}
function optionalSourcedText(record, field, locatorField, context) {
  const text = record[field] ?? null;
  const locator = record[locatorField] ?? null;
  if (text === null && locator !== null) {
    throw new Error(`${context}: ${locatorField} has no ${field}`);
  }
  if (text !== null) {
    exactText(text, `${context}.${field}`, field === 'fullText' ? 100_000 : 500);
    exactText(locator, `${context}.${locatorField}`, 500);
  }
  return text !== null;
}
function requireUtc(value, context) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error(`${context}: must be a valid explicit UTC instant`);
  }
}

/**
 * Validate a complete manually verified documentary source, without guessing
 * GAG proposal titles, sponsors, outcomes or missing text. A preflight receipt
 * is not an import receipt and does not create canonical history.
 */
export function validateGagManifest(manifest, sourceBytes, manifestBytes) {
  assertObject(manifest, 'manifest');
  knownKeys(manifest, MANIFEST_KEYS, 'manifest');
  if (manifest.schemaVersion !== 1) throw new Error('manifest.schemaVersion: expected 1');
  assertObject(manifest.source, 'manifest.source');
  knownKeys(manifest.source, SOURCE_KEYS, 'manifest.source');
  const { documentId, documentSha256, citation, verifiedAt } = manifest.source;
  exactText(documentId, 'source.documentId', 160);
  exactText(citation, 'source.citation', 1000);
  requireUtc(verifiedAt, 'source.verifiedAt');
  if (typeof documentSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(documentSha256)) {
    throw new Error('source.documentSha256: expected a lowercase SHA-256 digest');
  }
  if (!Buffer.isBuffer(sourceBytes) || !sourceBytes.length || sourceBytes.length > MAX_SOURCE_BYTES) {
    throw new Error('source bytes: missing or exceeds 32 MiB');
  }
  if (!Buffer.isBuffer(manifestBytes) || !manifestBytes.length || manifestBytes.length > MAX_MANIFEST_BYTES) {
    throw new Error('manifest bytes: missing or exceeds 2 MiB');
  }
  if (sha256(sourceBytes) !== documentSha256) {
    throw new Error('source.documentSha256: source file differs from claimed documentary evidence');
  }
  if (!Array.isArray(manifest.records) || manifest.records.length === 0 || manifest.records.length > MAX_RECORDS) {
    throw new Error('manifest.records: expected 1 to 5000 actual source records');
  }
  const seen = new Set();
  const rows = manifest.records.map((record, index) => {
    const context = `records[${index}]`;
    assertObject(record, context);
    knownKeys(record, RECORD_KEYS, context);
    const identifier = exactText(record.identifier, `${context}.identifier`, 160);
    const collisionKey = identifier.normalize('NFC').toLocaleLowerCase('en-US');
    if (seen.has(collisionKey)) throw new Error(`${context}.identifier: duplicate or ambiguous identifier`);
    seen.add(collisionKey);
    const sourceLocator = exactText(record.sourceLocator, `${context}.sourceLocator`);
    if (record.outcome !== null && record.outcome !== undefined) {
      exactText(record.outcome, `${context}.outcome`, 160);
    }
    const titleProvided = optionalSourcedText(record, 'title', 'titleSourceLocator', context);
    const sponsorProvided = optionalSourcedText(record, 'sponsor', 'sponsorSourceLocator', context);
    const fullTextProvided = optionalSourcedText(record, 'fullText', 'fullTextSourceLocator', context);
    if (record.textAvailability !== 'available' && record.textAvailability !== 'unavailable') {
      throw new Error(`${context}.textAvailability: expected available or unavailable`);
    }
    if ((record.textAvailability === 'available') !== fullTextProvided) {
      throw new Error(`${context}: available text requires sourced fullText; unavailable text must be null`);
    }
    return {
      identifier, outcome: record.outcome ?? null, sourceLocator, textAvailability: record.textAvailability,
      titleProvided, sponsorProvided, fullTextProvided,
    };
  });
  return {
    kind: 'historical_gag_source_preflight',
    schemaVersion: 1,
    status: 'source_checked_not_imported',
    source: { documentId, documentSha256, citation, verifiedAt },
    manifestSha256: sha256(manifestBytes),
    recordCount: rows.length,
    records: rows,
    limitations: ['No independent historical truth or record authenticity is established.', 'No TG7/TG9 import, publication, migration or production write was performed.'],
  };
}

function usage() {
  return 'Usage: node scripts/world-gag-import-preflight.mjs --manifest <source-manifest.json> --source <original-document-file> [--output <report.json>]';
}
export async function runCli(args) {
  if (args.length === 1 && args[0] === '--help') return { help: usage() };
  if (args.length < 4 || args.length > 6 || args.length % 2 !== 0) throw new Error(usage());
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--manifest', '--source', '--output'].includes(key) || options.has(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(usage());
    }
    options.set(key, args[i + 1]);
  }
  if (!options.has('--manifest') || !options.has('--source')) throw new Error(usage());
  const manifestBytes = await readFile(options.get('--manifest'));
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('manifest file exceeds 2 MiB');
  const sourceBytes = await readFile(options.get('--source'));
  if (sourceBytes.length > MAX_SOURCE_BYTES) throw new Error('source file exceeds 32 MiB');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const report = validateGagManifest(manifest, sourceBytes, manifestBytes);
  if (options.has('--output')) await writeFile(options.get('--output'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then(({ help, report }) => {
    console.log(help ?? JSON.stringify(report, null, 2));
  }).catch((error) => {
    console.error(`GAG preflight failed: ${error.message}`);
    process.exitCode = 1;
  });
}
