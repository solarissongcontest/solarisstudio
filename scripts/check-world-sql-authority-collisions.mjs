#!/usr/bin/env node
/** Read-only TG19 guard: overlapping canonical SQL object definitions across PRs.
 * No database access, Supabase client, workflow changes, or mutation endpoint.
 * A report is a REVIEW SIGNAL, not proof of conflicting migrations or certification.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PRS = 160;
const MAX_FILES_PER_PR = 500;
const MAX_SQL_FILES = 240;
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const MIGRATION_PATTERN = /^supabase\/migrations\/[^/]+\.sql$/i;
const OBJECT_PATTERN = /(?:^|;)\s*create\s+(?:or\s+replace\s+)?(materialized\s+view|table|function|procedure|view|type)\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/gim;

function maskSql(sql) {
  let result = '';
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith('--', i)) {
      let j = sql.indexOf('\n', i); if (j === -1) j = sql.length;
      result += ' '.repeat(j - i); i = j; continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1, j = i + 2;
      while (j < sql.length && depth) {
        if (sql.startsWith('/*', j)) { depth++; j += 2; }
        else if (sql.startsWith('*/', j)) { depth--; j += 2; }
        else j++;
      }
      if (depth) throw new Error('Unterminated SQL block comment');
      result += sql.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue;
    }
    if (sql[i] === "'") {
      let j = i + 1, closed = false;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") { j++; closed = true; break; }
        else j++;
      }
      if (!closed) throw new Error('Unterminated SQL string');
      result += sql.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue;
    }
    if (sql[i] === '$') {
      const match = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(i));
      if (match) {
        const tag = match[0], end = sql.indexOf(tag, i + tag.length);
        if (end < 0) throw new Error('Unterminated SQL dollar quote');
        const j = end + tag.length;
        result += sql.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue;
      }
    }
    result += sql[i++];
  }
  return result;
}

function splitArgs(input) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '(') depth++;
    if (input[i] === ')') depth--;
    if (depth < 0) throw new Error('Unbalanced SQL argument types');
    if (input[i] === ',' && depth === 0) { parts.push(input.slice(start, i)); start = i + 1; }
  }
  if (depth) throw new Error('Unbalanced SQL argument types');
  parts.push(input.slice(start));
  return parts;
}

function normalizeArg(input) {
  const raw = input.trim().replace(/\s+(?:default|=)\s+[\s\S]*$/i, '').trim();
  if (!raw) throw new Error('Empty SQL function argument');
  const words = raw.split(/\s+/).filter(Boolean);
  if (/^out$/i.test(words[0])) return null; // OUT-only args do not determine routine identity.
  if (/^(in|inout|variadic)$/i.test(words[0])) words.shift();
  if (words.length > 1 && /^(p_|arg_|a_)/i.test(words[0])) words.shift();
  if (!words.length) throw new Error('Unrecognizable SQL argument');
  return words.join(' ').toLowerCase().replace(/\s*([(),])\s*/g, '$1')
    .replace(/\bint4\b|\binteger\b/g, 'int4')
    .replace(/\bint8\b|\bbigint\b/g, 'int8')
    .replace(/\bbool\b|\bboolean\b/g, 'bool');
}

export function sqlDeclarations(source) {
  if (typeof source !== 'string') throw new Error('SQL source must be text');
  const masked = maskSql(source), found = [];
  for (const match of masked.matchAll(OBJECT_PATTERN)) {
    const kind = match[1].toLowerCase().replace(/\s+/g, '_');
    const object = match[2].replace(/"/g, '').toLowerCase();
    const name = object.includes('.') ? object : `public.${object}`;
    let signature = '';
    if (kind === 'function' || kind === 'procedure') {
      let start = match.index + match[0].length;
      while (/\s/.test(masked[start] || '')) start++;
      if (masked[start] !== '(') throw new Error(`Cannot parse signature for ${name}`);
      let depth = 1, end = start + 1;
      for (; end < masked.length && depth; end++) {
        if (masked[end] === '(') depth++;
        if (masked[end] === ')') depth--;
      }
      if (depth) throw new Error(`Unclosed signature for ${name}`);
      const raw = masked.slice(start + 1, end - 1).trim();
      const args = raw ? splitArgs(raw).map(normalizeArg).filter(Boolean) : [];
      signature = `(${args.join(',')})`;
    }
    found.push({ kind, name, signature, key: `${kind}:${name}${signature}` });
  }
  return found;
}

export function auditSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.prs) || typeof snapshot.mainSha !== 'string' || !/^[a-f0-9]{40}$/i.test(snapshot.mainSha)) {
    throw new Error('Snapshot requires an exact mainSha and prs array');
  }
  if (snapshot.prs.length > MAX_PRS) throw new Error('PR bound exceeded');
  const groups = new Map(), seenPrs = new Set();
  for (const pr of snapshot.prs) {
    if (!Number.isSafeInteger(pr.number) || pr.number < 1 || !/^[a-f0-9]{40}$/i.test(pr.headSha || '') || !Array.isArray(pr.files) || pr.files.length > MAX_FILES_PER_PR || seenPrs.has(pr.number)) {
      throw new Error('Invalid, excessive, or duplicate PR snapshot');
    }
    seenPrs.add(pr.number);
    for (const file of pr.files) {
      if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') throw new Error('Invalid migration file snapshot');
      if (!MIGRATION_PATTERN.test(file.path)) continue;
      const digest = createHash('sha256').update(file.content).digest('hex');
      for (const object of sqlDeclarations(file.content)) {
        const perPr = groups.get(object.key) || new Map();
        const own = perPr.get(pr.number) || [];
        own.push({ number: pr.number, headSha: pr.headSha, path: file.path, sourceSha256: digest });
        perPr.set(pr.number, own); groups.set(object.key, perPr);
      }
    }
  }
  const collisions = [];
  for (const [key, byPr] of groups) {
    if (byPr.size < 2) continue;
    const sources = [...byPr.values()].flat();
    const kinds = new Set(sources.map(x => x.sourceSha256));
    collisions.push({ object: key, classification: kinds.size === 1 ? 'identical-source-review' : 'different-source-review', sources });
  }
  collisions.sort((a, b) => a.object.localeCompare(b.object));
  return { mainSha: snapshot.mainSha, inspectedPrs: snapshot.prs.map(x => ({ number: x.number, headSha: x.headSha })), collisions, note: 'Read-only source-level review signals. Not merge authorization, live SQL verification, or release certification.' };
}

async function liveSnapshot(repo, requested) {
  if (!REPO_PATTERN.test(repo)) throw new Error('Repository must be owner/name');
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('Live scan requires GITHUB_TOKEN or GH_TOKEN');
  let requests = 0;
  async function get(path) {
    if (++requests > 600) throw new Error('GitHub API request budget exceeded');
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status} on read-only API`);
    return response.json();
  }
  const firstMain = (await get('/branches/main')).commit?.sha;
  if (!/^[a-f0-9]{40}$/i.test(firstMain || '')) throw new Error('No exact main SHA');
  let prs = [];
  if (requested.length) {
    if (requested.length > MAX_PRS) throw new Error('PR bound exceeded');
    prs = await Promise.all(requested.map(n => get(`/pulls/${n}`)));
  } else {
    for (let page = 1; page <= 3; page++) {
      const batch = await get(`/pulls?state=open&per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Incomplete PR list');
      prs.push(...batch);
      if (batch.length < 100) break;
      if (page === 3) throw new Error('Too many open PRs: request specific --pr numbers');
    }
    prs = prs.filter(p => /(?:world|terra|tg\d{1,2})/i.test(`${p.title || ''} ${p.head?.ref || ''} ${p.base?.ref || ''}`));
  }
  if (prs.length > MAX_PRS) throw new Error('World PR bound exceeded: use --pr');
  const snapshots = [];
  for (const pr of prs) {
    if (!/^[a-f0-9]{40}$/i.test(pr.head?.sha || '')) throw new Error(`Missing head of PR #${pr.number}`);
    const files = [];
    for (let page = 1; page <= 6; page++) {
      const batch = await get(`/pulls/${pr.number}/files?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Incomplete PR files');
      for (const file of batch) {
        if (MIGRATION_PATTERN.test(file.filename) && file.status !== 'removed') {
          if (files.length >= MAX_SQL_FILES) throw new Error('World SQL migration scan bound exceeded');
          const encodedPath = file.filename.split('/').map(encodeURIComponent).join('/');
          const resource = await get(`/contents/${encodedPath}?ref=${encodeURIComponent(pr.head.sha)}`);
          if (resource.encoding !== 'base64' || typeof resource.content !== 'string') throw new Error('Incomplete SQL content');
          files.push({ path: file.filename, content: Buffer.from(resource.content.replace(/\s/g, ''), 'base64').toString('utf8') });
        }
      }
      if (batch.length < 100) break;
      if (page === 6) throw new Error('PR file pagination bound exceeded');
    }
    snapshots.push({ number: pr.number, headSha: pr.head.sha, files });
  }
  const secondMain = (await get('/branches/main')).commit?.sha;
  if (firstMain !== secondMain) throw new Error('main changed during capture; retry with fresh snapshot');
  for (const p of snapshots) {
    const check = await get(`/pulls/${p.number}`);
    if (check.head?.sha !== p.headSha) throw new Error(`PR #${p.number} changed during capture`);
  }
  return { mainSha: firstMain, prs: snapshots };
}

async function main() {
  const args = process.argv.slice(2), selected = [];
  let snapshotPath = null, live = false, repo = 'solarissongcontest/solarisstudio';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--snapshot') snapshotPath = args[++i];
    else if (args[i] === '--live') live = true;
    else if (args[i] === '--repo') repo = args[++i];
    else if (args[i] === '--pr') selected.push(Number(args[++i]));
    else throw new Error(`Unknown flag ${args[i]}`);
  }
  if (live === Boolean(snapshotPath)) throw new Error('Choose exactly one: --live or --snapshot <file>');
  if (selected.some(n => !Number.isSafeInteger(n) || n < 1) || new Set(selected).size !== selected.length) throw new Error('Invalid PR selection');
  const data = live ? await liveSnapshot(repo, selected) : JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const result = auditSnapshot(data);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.collisions.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`World SQL authority audit unavailable: ${error.message}\n`); process.exitCode = 2; });
}
