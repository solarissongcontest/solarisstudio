#!/usr/bin/env node
/**
 * Offline, owner-supplied Supabase schema_migrations CSV -> existing V3 audit JSON.
 * No Supabase client, SQL, network, or hard-coded production project identity.
 * Keep BOTH original CSV and converted JSON outside the repository and CI.
 */
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function csvCells(text) {
  const rows = [];
  let row = [], field = '', quoted = false, afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; afterQuote = true; }
      else field += c;
    } else if (afterQuote) {
      if (c === ',') { row.push(field); field = ''; afterQuote = false; }
      else if (c === '\r' && text[i + 1] === '\n') { rows.push([...row, field]); row = []; field = ''; afterQuote = false; i++; }
      else if (c === '\n') { rows.push([...row, field]); row = []; field = ''; afterQuote = false; }
      else throw new Error('Unexpected characters after quoted CSV field');
    } else if (c === '"') {
      if (field) throw new Error('Unexpected quote in unquoted CSV field');
      quoted = true;
    } else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { rows.push([...row, field]); row = []; field = ''; i++; }
    else if (c === '\n') { rows.push([...row, field]); row = []; field = ''; }
    else if (c === '\r') throw new Error('Bare CR in CSV');
    else field += c;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field');
  if (field !== '' || row.length || afterQuote) rows.push([...row, field]);
  return rows;
}

function convert(source, expectedCount) {
  const rows = csvCells(source.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('Missing CSV header or history rows');
  const columns = rows.shift();
  const withIndex = columns.join(',') === 'index,version,name';
  if (!withIndex && columns.join(',') !== 'version,name')
    throw new Error('Expected CSV header version,name or index,version,name');
  const seen = new Set();
  const migrations = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== (withIndex ? 3 : 2)) throw new Error(`Invalid CSV column count at row ${i + 2}`);
    if (withIndex && row[0] !== String(i)) throw new Error(`Invalid export index at row ${i + 2}`);
    const [version, name] = row.slice(withIndex ? 1 : 0);
    if (!/^\d{14}$/.test(version)) throw new Error(`Invalid migration version at row ${i + 2}`);
    if (!name || /[\x00-\x1F\x7F]/.test(name)) throw new Error(`Invalid migration name at row ${i + 2}`);
    if (seen.has(version)) throw new Error(`Duplicate version ${version}`);
    if (migrations.length && migrations.at(-1).version >= version)
      throw new Error(`Migration versions not strictly ascending at row ${i + 2}`);
    seen.add(version);
    migrations.push({version, name});
  }
  if (expectedCount !== null && migrations.length !== expectedCount)
    throw new Error(`Expected ${expectedCount} migrations, received ${migrations.length}`);
  return migrations;
}

function main() {
  const args = process.argv.slice(2);
  const argument = key => { const i = args.indexOf(key); return i < 0 ? null : (args[i + 1] ?? null); };
  if (args.some(x => x.startsWith('--') && !['--csv', '--output', '--expected-count'].includes(x)))
    throw new Error('Unknown option');
  const csv = argument('--csv'), output = argument('--output');
  const countRaw = argument('--expected-count');
  if (!csv || !output || !isAbsolute(csv) || !isAbsolute(output) || csv.startsWith('--') || output.startsWith('--'))
    throw new Error('Provide absolute --csv and --output paths, both outside the repository');
  const expectedCount = countRaw === null ? null : Number(countRaw);
  if (countRaw !== null && (!/^\d+$/.test(countRaw) || !Number.isSafeInteger(expectedCount) || expectedCount < 1))
    throw new Error('--expected-count must be a positive integer');
  const inputPath = realpathSync(csv), outputPath = resolve(output);
  const parent = realpathSync(dirname(outputPath));
  const repo = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  const withinRepo = path => path === repo || relative(repo, path) === '' || (!relative(repo, path).startsWith('..' + sep) && relative(repo, path) !== '..' && !isAbsolute(relative(repo, path)));
  if (withinRepo(inputPath) || withinRepo(parent))
    throw new Error('Evidence inputs and outputs must remain outside the repository');
  if (inputPath === outputPath) throw new Error('Output must differ from source CSV');
  const raw = readFileSync(inputPath);
  const migrations = convert(raw.toString('utf8'), expectedCount);
  const converted = JSON.stringify({migrations}, null, 2) + '\n';
  const fd = openSync(outputPath, 'wx', 0o600);
  try { writeFileSync(fd, converted, {encoding:'utf8'}); }
  catch (e) { closeSync(fd); unlinkSync(outputPath); throw e; }
  closeSync(fd);
  console.log(JSON.stringify({
    records:migrations.length,
    latestVersion:migrations.at(-1).version,
    csvSha256:createHash('sha256').update(raw).digest('hex'),
    jsonSha256:createHash('sha256').update(converted).digest('hex'),
    projectIdentityVerified:false,
    note:'Offline translation only; the JSON can be passed to the existing frontier auditor. No hosted project provenance established.'
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`FAIL CLOSED: ${e.message}`); process.exitCode = 2; }
}

export { csvCells, convert };
