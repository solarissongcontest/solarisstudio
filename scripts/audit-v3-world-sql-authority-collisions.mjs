#!/usr/bin/env node
/**
 * TG0/TG19 offline, advisory cross-PR PostgreSQL DDL identity preflight.
 * No database/GitHub calls; never a substitute for S13/S16 or local SQL tests.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/i;
const ID = '(?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*)';
const QUALIFIED = ID + '(?:\\s*\\.\\s*' + ID + ')*';
const CREATE = new RegExp('\\bCREATE\\s+(?:(?:OR\\s+REPLACE|TEMP(?:ORARY)?|UNLOGGED|CONSTRAINT)\\s+)*(MATERIALIZED\\s+VIEW|TABLE|VIEW|FUNCTION|PROCEDURE|POLICY|TRIGGER)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED + ')', 'gi');
const BASIC = /^(?:uuid|text|integer|int2|int4|int8|int|bigint|smallint|numeric|decimal|boolean|bool|jsonb?|date|bytea|real|float[48]|double|character|char|varchar|citext|regclass|interval|timestamp|timestamptz|time|timetz|record|oid|inet|anyelement)(?:\s|\(|\[|$)/i;
const COMPOUND = /^(?:double\s+precision|character\s+varying|bit\s+varying|timestamp(?:\s+with(?:out)?\s+time\s+zone)?|time(?:\s+with(?:out)?\s+time\s+zone)?)(?:\s|\(|\[|$)/i;

function maskSql(source) {
  const out = source.split('');
  const blank = (a, b) => { for (let j = a; j < b; j++) if (out[j] !== '\n' && out[j] !== '\r') out[j] = ' '; };
  for (let i = 0; i < source.length;) {
    if (source.startsWith('--', i)) {
      let j = source.indexOf('\n', i);
      if (j < 0) j = source.length;
      blank(i, j); i = j; continue;
    }
    if (source.startsWith('/*', i)) {
      let depth = 1, j = i + 2;
      while (j < source.length && depth) {
        if (source.startsWith('/*', j)) { depth++; j += 2; }
        else if (source.startsWith('*/', j)) { depth--; j += 2; }
        else j++;
      }
      if (depth) throw new Error('Unclosed SQL block comment');
      blank(i, j); i = j; continue;
    }
    if (source[i] === "'") {
      let j = i + 1, closed = false;
      while (j < source.length) {
        if (source[j] === "'" && source[j + 1] === "'") { j += 2; continue; }
        if (source[j] === "'") { j++; closed = true; break; }
        j++;
      }
      if (!closed) throw new Error('Unclosed SQL string');
      blank(i, j); i = j; continue;
    }
    if (source[i] === '$') {
      const tag = /^(?:\$[a-z_][a-z_0-9]*\$|\$\$)/i.exec(source.slice(i))?.[0];
      if (tag) {
        const end = source.indexOf(tag, i + tag.length);
        if (end === -1) throw new Error('Unclosed SQL dollar quote');
        const j = end + tag.length; blank(i, j); i = j; continue;
      }
    }
    if (source[i] === '"') {
      let j = i + 1, closed = false;
      while (j < source.length) {
        if (source[j] === '"' && source[j + 1] === '"') { j += 2; continue; }
        if (source[j] === '"') { j++; closed = true; break; }
        j++;
      }
      if (!closed) throw new Error('Unclosed SQL identifier');
      i = j; continue;
    }
    i++;
  }
  return out.join('');
}

function normalizeName(raw) {
  const parts = raw.match(/"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*/gi) || [];
  if (!parts.length || parts.length > 2) throw new Error('Ambiguous SQL identifier: ' + raw);
  const normalized = parts.map(part => {
    if (!part.startsWith('"')) return part.toLowerCase();
    const inner = part.slice(1, -1).replace(/""/g, '"');
    return /^[a-z_][a-z0-9_$]*$/.test(inner) ? inner : '"' + inner.replace(/"/g, '""') + '"';
  });
  return (parts.length === 1 ? ['public', ...normalized] : normalized).join('.');
}

function argumentsList(raw) {
  const args = []; let level = 0, start = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '(') level++;
    if (raw[i] === ')') level--;
    if (raw[i] === ',' && level === 0) { args.push(raw.slice(start, i)); start = i + 1; }
  }
  args.push(raw.slice(start));
  return args.map(x => x.trim()).filter(Boolean);
}

function parameterType(raw) {
  let arg = raw.replace(/\s+/g, ' ').trim();
  if (/^(?:OUT|INOUT|TABLE)\s/i.test(arg)) return null;
  arg = arg.replace(/^(?:IN|VARIADIC)\s+/i, '');
  arg = arg.split(/\s+DEFAULT\s+|\s*=\s*/i)[0].trim();
  if (!arg) throw new Error('Missing SQL routine parameter type');
  const pair = /^("(?:[^"]|"")*"|[a-z_][a-z0-9_$]*)\s+(.+)$/i.exec(arg);
  if (pair && !BASIC.test(arg) && !COMPOUND.test(arg) &&
    (pair[1].startsWith('"') || /^p_[a-z0-9_$]+$/i.test(pair[1]) ||
    BASIC.test(pair[2]) || COMPOUND.test(pair[2]) ||
    /^("[^"]+"|[a-z_][a-z0-9_$]*)\s*\./i.test(pair[2]))) arg = pair[2];
  arg = arg.toLowerCase().replace(/\s*([(),\[\]])\s*/g, '$1');
  arg = arg.replace(/^(numeric|decimal|varchar|character varying)\(\d+(?:,\d+)?\)(\[\])?$/, '$1$2');
  const array = arg.endsWith('[]');
  let base = array ? arg.slice(0, -2) : arg;
  const aliases = {int: 'integer', int4: 'integer', int8: 'bigint', int2: 'smallint',
    bool: 'boolean', decimal: 'numeric', varchar: 'character varying',
    float8: 'double precision', float4: 'real', timestamptz: 'timestamp with time zone',
    timetz: 'time with time zone'};
  base = aliases[base] || base;
  return base + (array ? '[]' : '');
}

export function extractSqlObjects(source) {
  if (typeof source !== 'string' || source.length > 5000000) throw new Error('Missing SQL source or exceeds 5 MB');
  const sql = maskSql(source), objects = [];
  const parser = new RegExp(CREATE.source, CREATE.flags);
  let match;
  while ((match = parser.exec(sql))) {
    const kind = match[1].toLowerCase().replace(/\s+/g, '_');
    const name = normalizeName(match[2]);
    let identity;
    if (['table', 'view', 'materialized_view'].includes(kind)) identity = 'relation:' + name;
    else if (kind === 'function' || kind === 'procedure') {
      const open = parser.lastIndex + (sql.slice(parser.lastIndex).match(/^\s*/)?.[0].length || 0);
      if (sql[open] !== '(') throw new Error('Missing SQL routine argument list for ' + name);
      let depth = 0, close = -1;
      for (let i = open; i < sql.length; i++) {
        if (sql[i] === '(') depth++;
        if (sql[i] === ')' && --depth === 0) { close = i; break; }
      }
      if (close < 0) throw new Error('Unclosed SQL routine argument list for ' + name);
      const inputs = argumentsList(sql.slice(open + 1, close)).map(parameterType).filter(Boolean);
      identity = 'routine:' + name + '(' + inputs.join(',') + ')';
    } else {
      const end = sql.indexOf(';', parser.lastIndex);
      const suffix = sql.slice(parser.lastIndex, end < 0 ? undefined : end);
      const on = new RegExp('\\bON\\s+(' + QUALIFIED + ')', 'i').exec(suffix);
      if (!on) throw new Error(kind + ' lacks table ON: ' + name);
      identity = kind + ':' + normalizeName(on[1]) + '/' + name.split('.').at(-1);
    }
    objects.push({ identity, kind, name, line: sql.slice(0, match.index).split('\n').length });
  }
  return objects;
}

export function auditWorldSqlAuthorities(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.candidates) ||
    snapshot.candidates.length < 1 || snapshot.candidates.length > 100)
    throw new Error('Expected schemaVersion=1 and 1–100 candidates');
  const refs = new Set(), heads = new Set(), objects = new Map(); let files = 0, found = 0;
  for (const c of snapshot.candidates) {
    if (!Number.isSafeInteger(c.pr) || c.pr < 1 || refs.has(c.pr)) throw new Error('Invalid/duplicate PR');
    if (!SHA.test(c.headSha || '') || heads.has(c.headSha.toLowerCase()))
      throw new Error('Missing/duplicate exact PR head SHA');
    refs.add(c.pr); heads.add(c.headSha.toLowerCase());
    if (!Array.isArray(c.migrations) || c.migrations.length > 250)
      throw new Error('Missing migration patch array (maximum 250)');
    for (const migration of c.migrations) {
      if (typeof migration?.path !== 'string' ||
        !/^supabase\/migrations\/\d{14}_[\w.-]+\.sql$/.test(migration.path))
        throw new Error('Unsafe/missing 14-digit migration path');
      files++;
      for (const object of extractSqlObjects(migration.source)) {
        found++;
        const occurrence = {pr: c.pr, headSha: c.headSha.toLowerCase(), path: migration.path, ...object};
        if (!objects.has(object.identity)) objects.set(object.identity, []);
        objects.get(object.identity).push(occurrence);
      }
    }
  }
  const collisions = [...objects].filter(([, values]) => new Set(values.map(x => x.pr)).size > 1)
    .map(([identity, occurrences]) => ({identity, category: 'cross_pr_sql_authority_review', occurrences}))
    .sort((a, b) => a.identity.localeCompare(b.identity));
  return {schemaVersion: 1, candidateCount: refs.size, checkedMigrationPatches: files,
    objectsInspected: found, clean: collisions.length === 0, collisionCount: collisions.length, collisions,
    limitation: 'Static caller-provided SQL patch scan. No PostgreSQL execution, dynamic DDL, grant/RLS audit, parent ancestry, merger, deployment or certification.'};
}

export function runCli(args) {
  if (args.includes('--help')) {
    process.stdout.write('Usage: node scripts/audit-v3-world-sql-authority-collisions.mjs --input snapshot.json|- [--require-clean] [--json-output report.json]\n');
    return 0;
  }
  let input, output, requireClean = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--require-clean') {requireClean = true; continue;}
    if (args[i] === '--input' || args[i] === '--json-output') {
      const flag = args[i], value = args[++i];
      if (!value) throw new Error(flag + ' requires a value');
      if (flag === '--input') input = value; else output = value;
    } else throw new Error('Unknown option: ' + args[i]);
  }
  if (!input) throw new Error('--input is required');
  const report = auditWorldSqlAuthorities(JSON.parse(readFileSync(input === '-' ? 0 : input, 'utf8')));
  const data = JSON.stringify(report, null, 2) + '\n';
  if (output) writeFileSync(output, data); else process.stdout.write(data);
  return requireClean && !report.clean ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {process.exitCode = runCli(process.argv.slice(2));}
  catch (error) {
    process.stderr.write('World SQL DDL authority audit failed closed: ' + String(error?.message || error) + '\n');
    process.exitCode = 1;
  }
}
