#!/usr/bin/env node
/**
 * Terra Solaris TG17/TG19: offline, fail-closed source proof for historical GAG
 * manifests. This deliberately NEVER inserts, updates or publishes records.
 * Canonical TG7/TG9 owners decide how a validated source maps to live tables.
 */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS = 5000;
const MANIFEST_KEYS = new Set(['schemaVersion', 'source', 'records']);
const SOURCE_KEYS = new Set(['documentId', 'documentSha256', 'citation', 'verifiedAt']);
const RECORD_KEYS = new Set([
  'identifier', 'outcome', 'outcomeSourceLocator', 'sourceLocator', 'textAvailability', 'fullText',
  'fullTextSourceLocator', 'title', 'titleSourceLocator', 'sponsor', 'sponsorSourceLocator',
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * JSON.parse silently accepts duplicate object keys, including escaped key
 * spellings. For historical provenance that creates an ambiguous source even
 * though the resulting JavaScript object appears valid. Scan every object and
 * reject duplicates before using any parsed record.
 *
 * JSON.parse first establishes valid JSON syntax; this bounded scanner then
 * follows that grammar solely to track object keys. The original bytes remain
 * unchanged and continue to determine the manifest SHA-256 receipt.
 */
function parseUnambiguousManifestBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_MANIFEST_BYTES) {
    throw new Error('manifest bytes: missing or exceeds 2 MiB');
  }
  let raw;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('manifest: invalid UTF-8 source bytes');
  }
  const parsed = JSON.parse(raw);
  let position = 0;
  const whitespace = () => {
    while (position < raw.length && /[ \t\r\n]/u.test(raw[position])) position++;
  };
  const scanString = () => {
    const start = position++;
    while (position < raw.length) {
      if (raw[position] === '\\') { position += 2; continue; }
      if (raw[position] === '"') {
        position++;
        return JSON.parse(raw.slice(start, position));
      }
      position++;
    }
    throw new Error('manifest: unterminated string');
  };
  const scanValue = (depth) => {
    if (depth > 64) throw new Error('manifest: JSON nesting exceeds 64 levels');
    whitespace();
    if (raw[position] === '{') {
      position++;
      const names = new Set();
      whitespace();
      if (raw[position] === '}') { position++; return; }
      while (position < raw.length) {
        const name = scanString();
        if (names.has(name)) throw new Error(`manifest: duplicate JSON object key ${JSON.stringify(name)}`);
        names.add(name);
        whitespace();
        position++; // colon (syntax already checked by JSON.parse)
        scanValue(depth + 1);
        whitespace();
        if (raw[position] === '}') { position++; return; }
        position++; // comma
        whitespace();
      }
    } else if (raw[position] === '[') {
      position++;
      whitespace();
      if (raw[position] === ']') { position++; return; }
      while (position < raw.length) {
        scanValue(depth + 1);
        whitespace();
        if (raw[position] === ']') { position++; return; }
        position++; // comma
      }
    } else if (raw[position] === '"') {
      scanString();
    } else {
      // Primitive JSON token; JSON.parse has already verified its grammar.
      while (position < raw.length && !/[,}\] \t\r\n]/u.test(raw[position])) position++;
    }
  };
  scanValue(0);
  whitespace();
  if (position !== raw.length) throw new Error('manifest: unexpected JSON trailing content');
  return parsed;
}

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
/**
 * Historical full text may contain real paragraph breaks, carriage returns
 * and indentation. Do not normalize, trim or collapse source content.
 * Refuse NUL and other unsafe controls, and all-whitespace documents.
 */
function exactDocumentText(value, context) {
  if (typeof value !== 'string' || value.length > 100_000 || !value.trim() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error(`${context}: expected sourced document text with only safe whitespace controls`);
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
    if (field === 'fullText') exactDocumentText(text, `${context}.${field}`);
    else exactText(text, `${context}.${field}`, 500);
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
  const parsedSource = parseUnambiguousManifestBytes(manifestBytes);
  if (JSON.stringify(manifest) !== JSON.stringify(parsedSource)) {
    throw new Error('manifest: supplied object does not match source manifest bytes');
  }
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
    const outcomeSourceLocator = record.outcomeSourceLocator ?? null;
    if (record.outcome !== null && record.outcome !== undefined) {
      exactText(record.outcome, `${context}.outcome`, 160);
      exactText(outcomeSourceLocator, `${context}.outcomeSourceLocator`);
    } else if (outcomeSourceLocator !== null) {
      throw new Error(`${context}: outcomeSourceLocator has no outcome`);
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
      identifier, outcome: record.outcome ?? null, outcomeSourceLocator, sourceLocator, textAvailability: record.textAvailability,
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
  // Check actual file sizes before allocating memory; also reject special files.
  const [manifestInfo, sourceInfo] = await Promise.all([
    stat(options.get('--manifest')),
    stat(options.get('--source')),
  ]);
  if (!manifestInfo.isFile() || !manifestInfo.size || manifestInfo.size > MAX_MANIFEST_BYTES) {
    throw new Error('manifest must be a regular nonempty file no larger than 2 MiB');
  }
  if (!sourceInfo.isFile() || !sourceInfo.size || sourceInfo.size > MAX_SOURCE_BYTES) {
    throw new Error('source must be a regular nonempty file no larger than 32 MiB');
  }
  const manifestBytes = await readFile(options.get('--manifest'));
  const sourceBytes = await readFile(options.get('--source'));
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
