#!/usr/bin/env node
// S06 ONLY: offline inspection of pg_restore --list output from an operator-held
// schema-only custom-format dump. Never opens a database or network connection.
// Passing this preflight is NOT hosted-equivalent recovery certification.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMAS = new Set(['auth', 'private', 'public', 'televoting']);
const FORBIDDEN_DATA_KINDS = /^(?:TABLE DATA|MATERIALIZED VIEW DATA|SEQUENCE SET|BLOBS?|LARGE OBJECT|DATABASE PROPERTIES)\b/;

function sourceNames(snapshot) {
  if (!snapshot || snapshot.pg_version_num !== 170011 || !Array.isArray(snapshot.relations)) {
    throw Error('S06 blocked: expected PG17.11 hosted catalog baseline missing');
  }
  const ids = snapshot.relations.map(x => x.schema_name + '.' + x.object_name);
  if (ids.length !== 215 || new Set(ids).size !== 215 ||
      ids.some(x => !/^(auth|private|public|televoting)\.[a-z_][a-z_0-9]*$/.test(x))) {
    throw Error('S06 blocked: unexpected hosted relation identity inventory');
  }
  return ids;
}

export function inspectSchemaToc(toc, hostedRelationIds, options = {}) {
  if (typeof toc !== 'string' || toc.length > 5_000_000 || !toc.trim()) {
    throw Error('S06 blocked: invalid or oversized pg_restore TOC');
  }
  const wanted = new Set(hostedRelationIds);
  if (!wanted.size || wanted.size !== hostedRelationIds.length) {
    throw Error('S06 blocked: duplicate or empty expected relation inventory');
  }
  if (!/^;\s*Dumped from database version:\s*17\.11(?:\s|$)/m.test(toc)) {
    throw Error('S06 blocked: no verified PostgreSQL 17.11 source header');
  }
  if (!/^;\s*Format:\s*CUSTOM\s*$/m.test(toc)) {
    throw Error('S06 blocked: input must be a custom-format pg_restore TOC');
  }
  const found = new Set();
  const counts = {};
  let entries = 0;
  for (const line of toc.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith(';')) continue;
    const m = line.match(/^\d+;\s+\d+\s+\d+\s+(.+)$/);
    if (!m) throw Error('S06 blocked: unexpected TOC line (not pg_restore --list)');
    entries++;
    const rest = m[1];
    if (FORBIDDEN_DATA_KINDS.test(rest)) {
      throw Error('S06 blocked: data-bearing TOC entry (not schema-only)');
    }
    const k = rest.match(/^([A-Z][A-Z ]+?)\s+(?:auth|private|public|televoting|-)\s+/);
    if (k) counts[k[1]] = (counts[k[1]] || 0) + 1;
    const t = rest.match(/^TABLE\s+(auth|private|public|televoting)\s+([a-z_][a-z_0-9]*)\s+/);
    if (t) {
      const id = t[1] + '.' + t[2];
      if (found.has(id)) throw Error('S06 blocked: duplicate table TOC entry: ' + id);
      found.add(id);
    }
  }
  if (!entries) throw Error('S06 blocked: no schema objects in TOC');
  const missing = [...wanted].filter(id => !found.has(id)).sort();
  const unexpected = [...found].filter(id => !wanted.has(id)).sort();
  if (missing.length || unexpected.length) {
    throw Error('S06 blocked: exported TABLE identities do not match hosted baseline; missing=' +
      missing.length + ', unexpected=' + unexpected.length +
      (missing.length ? ', first_missing=' + missing[0] : '') +
      (unexpected.length ? ', first_unexpected=' + unexpected[0] : ''));
  }
  return {
    task: 'S06',
    status: 'TOC_SCHEMA_ONLY_PREFLIGHT_NOT_CERTIFIED',
    sourcePgVersion: '17.11',
    hostedHead: '20261101181812',
    sourceCatalogRelations: wanted.size,
    tocTableIdentitiesMatched: found.size,
    tocObjectEntries: entries,
    tocObjectTypes: Object.fromEntries(Object.entries(counts).sort(([a],[b]) => a.localeCompare(b))),
    tocSha256: createHash('sha256').update(toc).digest('hex'),
    dataBearingTocEntries: 0,
    fullHostedEquivalenceCertified: false,
    productionSqlExecutedByThisChecker: false,
    reviewerApprovalOutstanding: true,
    missingIndependentProof: [
      'Verify source dump provenance and redaction of function bodies/embedded configuration',
      'Verify all schema functions, security and grants after isolated PG17.11 import',
      'Inspect missing extension objects, role inheritance and default privileges',
      'Verify 215-relation/727-routine full catalog digests after local import',
      'Seed synthetic Archive/Results/Televote/Tasks/notification state and run complete S13-to-S14 recovery'
    ],
    ...options
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) {
      throw Error('Usage: node scripts/v3-s06-schema-toc-preflight.mjs <local-pg_restore-list.txt> <new-report.json>');
    }
    const [tocPath, reportPath] = process.argv.slice(2);
    if (resolve(tocPath) === resolve(reportPath)) throw Error('Refusing to overwrite original TOC');
    const frozen = JSON.parse(readFileSync(
      new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json', import.meta.url),
      'utf8'
    ));
    const report = inspectSchemaToc(readFileSync(tocPath, 'utf8'), sourceNames(frozen));
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('S06 TOC preflight passed: table identities present, no data entries; FULL RECOVERY NOT CERTIFIED');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
