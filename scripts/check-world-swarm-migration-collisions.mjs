#!/usr/bin/env node
// TG0/TG19: read-only, exact-head migration preflight across open PRs.
// No Supabase, SQL, GitHub write, merge or deployment operations.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const ROOT = 'supabase/migrations/';
const SHA = /^[0-9a-f]{40}$/i;
const NAME = /^supabase\/migrations\/(\d{14})_[^/]+\.sql$/;
const WORLD = /world|\bTG\d+\b|wave2/i;
const since = '20261101000000';

export function validMigrationClock(v) {
  if (!/^\d{14}$/.test(v)) return false;
  const y = +v.slice(0, 4), m = +v.slice(4, 6), d = +v.slice(6, 8);
  const h = +v.slice(8, 10), min = +v.slice(10, 12), s = +v.slice(12, 14);
  if (y < 2000 || m < 1 || m > 12 || d < 1 || h > 23 || min > 59 || s > 59) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

export function auditWorldMigrationSnapshot(snapshot, candidate = null) {
  if (!snapshot || !/^[\w.-]+\/[\w.-]+$/.test(snapshot.repository || '') || !SHA.test(snapshot.mainSha || '')) {
    throw Error('Missing repository or exact main SHA');
  }
  if (!Array.isArray(snapshot.mainFiles) || !Array.isArray(snapshot.pullRequests)) throw Error('Incomplete migration snapshot');
  const issues = [], main = new Map(), owners = new Map(), paths = new Map(), prNumbers = new Set();
  const issue = (code, version, files, prs) => {
    const key = code + ':' + version + ':' + [...new Set(prs)].sort().join(',') + ':' + [...new Set(files)].sort().join(',');
    if (!issues.some(x => x.id === key)) issues.push({ id: key, code, version, files: [...new Set(files)].sort(), prs: [...new Set(prs)].sort((a,b)=>a-b) });
  };
  const basePaths = new Set();
  for (const item of snapshot.mainFiles) {
    const f = typeof item === 'string' ? item : item?.filename;
    if (typeof f !== 'string' || !f.startsWith(ROOT) || basePaths.has(f)) throw Error('Invalid or repeated main migration file');
    basePaths.add(f);
    const match = NAME.exec(f);
    if (!match) { if (f.endsWith('.sql')) issue('main_filename_invalid', null, [f], []); continue; }
    const earlier = main.get(match[1]);
    if (earlier && earlier !== f) issue('main_version_collision', match[1], [earlier, f], []);
    main.set(match[1], f);
  }
  for (const pr of snapshot.pullRequests) {
    if (!Number.isInteger(pr?.number) || pr.number < 1 || prNumbers.has(pr.number) || !SHA.test(pr.headSha || '') || !Array.isArray(pr.files)) {
      throw Error('Missing, duplicate or stale-looking PR metadata');
    }
    prNumbers.add(pr.number);
    const found = new Set();
    for (const item of pr.files) {
      const f = item?.filename, status = item?.status;
      if (typeof f !== 'string' || typeof status !== 'string' || found.has(f)) throw Error('Malformed PR changed-file list');
      found.add(f);
      const old = item.previous_filename;
      if (status === 'renamed' && typeof old === 'string' && basePaths.has(old)) issue('main_migration_renamed', null, [old, f], [pr.number]);
      if (!f.startsWith(ROOT) || !f.endsWith('.sql')) continue;
      const match = NAME.exec(f);
      if (!match) { issue('new_filename_invalid', null, [f], [pr.number]); continue; }
      const v = match[1];
      if (status === 'removed') { if (basePaths.has(f)) issue('main_migration_removed', v, [f], [pr.number]); continue; }
      if (!['added', 'modified', 'renamed', 'copied', 'changed'].includes(status)) throw Error('Unknown migration file status');
      if (v >= since && !validMigrationClock(v)) issue('invalid_new_calendar', v, [f], [pr.number]);
      if (basePaths.has(f)) issue('main_migration_edited', v, [f], [pr.number]);
      else if (main.has(v)) issue('version_already_on_main', v, [main.get(v), f], [pr.number]);
      owners.set(v, [...(owners.get(v) || []), { pr: pr.number, file: f }]);
      paths.set(f, [...(paths.get(f) || []), pr.number]);
    }
  }
  for (const [v, entries] of owners) {
    if (entries.length > 1) issue('cross_pr_version_collision', v, entries.map(x=>x.file), entries.map(x=>x.pr));
  }
  for (const [f, prs] of paths) {
    if (new Set(prs).size > 1) issue('cross_pr_path_overlap', NAME.exec(f)?.[1] || null, [f], prs);
  }
  if (candidate !== null && !prNumbers.has(candidate)) throw Error('Candidate PR absent from snapshot: fail closed');
  issues.sort((a,b)=>a.id.localeCompare(b.id));
  const blocking = candidate === null ? issues : issues.filter(x=>x.prs.length === 0 || x.prs.includes(candidate));
  return {
    repository: snapshot.repository, mainSha: snapshot.mainSha, source: snapshot.source || 'offline snapshot',
    scope: snapshot.scope || 'snapshot supplied', candidate,
    heads: snapshot.pullRequests.map(x=>({pr:x.number, sha:x.headSha})),
    scannedPrCount: snapshot.pullRequests.length, issueCount: issues.length,
    blockingIssueCount: blocking.length, clean: blocking.length === 0, issues,
    caution: 'Source-only. NOT SQL/RLS evidence, merge permission, production migration adoption, or release certification.'
  };
}

async function get(path, token) {
  const r = await fetch('https://api.github.com' + path, {
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw Error('GitHub read-only HTTP ' + r.status + ' for ' + path.split('?')[0]);
  return r.json();
}
async function pages(path, token) {
  const result = [];
  for (let page = 1; page <= 30; page++) {
    const data = await get(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page, token);
    if (!Array.isArray(data)) throw Error('Unexpected GitHub pagination response');
    result.push(...data);
    if (data.length < 100) return result;
  }
  throw Error('GitHub pagination limit; incomplete inventory not allowed');
}
export async function collectWorldMigrationSnapshot(repo, token, worldOnly = false) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) throw Error('Live scan needs valid --repo and GITHUB_TOKEN/GH_TOKEN');
  const root = '/repos/' + repo;
  const start = await get(root + '/branches/main', token), sha = start.commit?.sha;
  if (!SHA.test(sha || '')) throw Error('Main SHA unavailable');
  const dir = await get(root + '/contents/supabase/migrations?ref=' + sha, token);
  if (!Array.isArray(dir) || dir.length >= 1000) throw Error('Main migration file inventory incomplete');
  const all = await pages(root + '/pulls?state=open', token);
  const chosen = worldOnly ? all.filter(x => WORLD.test((x.title || '') + ' ' + (x.head?.ref || ''))) : all;
  const pullRequests = [];
  for (let i = 0; i < chosen.length; i += 5) {
    const rows = await Promise.all(chosen.slice(i,i+5).map(async pr => {
      if (!SHA.test(pr.head?.sha || '')) throw Error('PR exact SHA unavailable');
      const files = await pages(root + '/pulls/' + pr.number + '/files', token);
      const now = await get(root + '/pulls/' + pr.number, token);
      if (now.state !== 'open' || now.head?.sha !== pr.head.sha) throw Error('PR changed during scan: #' + pr.number);
      return { number: pr.number, headSha: pr.head.sha, files: files.map(x=>({filename:x.filename,status:x.status,previous_filename:x.previous_filename})) };
    }));
    pullRequests.push(...rows);
  }
  const end = await get(root + '/branches/main', token);
  if (end.commit?.sha !== sha) throw Error('Main advanced during scan; rerun exact-head audit');
  return { repository: repo, mainSha: sha, mainFiles: dir.filter(x=>x.type==='file' && x.name.endsWith('.sql')).map(x=>x.path),
    pullRequests, source:'live GitHub read-only', scope:worldOnly?'World-named/branched PRs':'all open PRs' };
}
async function cli(argv) {
  if (argv.includes('--help')) { console.log('Use --snapshot file.json OR --live [--repo owner/name] [--world-only] [--candidate PR]. No Supabase access.'); return; }
  const flag = f => {const i=argv.indexOf(f); return i===-1?null:argv[i+1];};
  const file=flag('--snapshot'), live=argv.includes('--live');
  if (live === Boolean(file)) throw Error('Specify exactly one of --snapshot or --live');
  const raw=flag('--candidate'), candidate=raw===null?null:Number(raw);
  if (raw!==null && (!Number.isInteger(candidate) || candidate<1)) throw Error('Invalid candidate PR');
  const input=live ? await collectWorldMigrationSnapshot(flag('--repo') || 'solarissongcontest/solarisstudio',
    process.env.GITHUB_TOKEN || process.env.GH_TOKEN, argv.includes('--world-only')) : JSON.parse(readFileSync(file,'utf8'));
  const report=auditWorldMigrationSnapshot(input,candidate);
  console.log(JSON.stringify(report,null,2));
  if (!report.clean) process.exitCode=1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch(e=>{ console.error('FAIL CLOSED: '+ e.message); process.exitCode=2; });
}
