#!/usr/bin/env node
// Read-only issue #2233 claim collision preflight. Not a lock or merge authority.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const STOP = /^(?:Tables\s*\/\s*RPCs|Existing PRs|Dependencies|Branch name|Estimated collision risk|Proposed integration sequence|Integration sequence|Canonical phase|Specific feature|Exact scope|Existing owner session|Main SHA|Tests\b|No schema|Request:)/i;
const PATH = /(?:\.github|public|src|scripts|supabase|docs)\/[\w.$*{}()[\]/-]+/g;
const CLAIM = /^TASK CLAIM(?:\b|\s|\s*[—:-])/i;
const RELEASE = /^CLAIM RELEASED(?:\b|\s|\s*[—/+:])/i;

function normalizePath(value) {
  return value.replace(/^[`'"(\s-]+/, '').replace(/[`'",;):.\s]+$/, '').replace(/\\/g, '/');
}

export function expectedPaths(body) {
  const lines = body.split(/\r?\n/);
  const index = lines.findIndex(line => /^\s*(?:[-*]\s*)?Files\s*\/\s*directories\s+expected\s+to\s+change\s*:/i.test(line));
  if (index < 0) return [];
  const block = [lines[index].split(/expected\s+to\s+change\s*:/i).slice(1).join(':')];
  for (const line of lines.slice(index + 1)) {
    const cleaned = line.replace(/^\s*(?:[-*]\s*)?/, '').trim();
    if (STOP.test(cleaned) || /^\s*#{1,4}\s/.test(line)) break;
    if (!cleaned && block.length > 1) break;
    block.push(line);
  }
  const paths = new Set();
  for (const match of block.join('\n').matchAll(PATH)) {
    const path = normalizePath(match[0]);
    if (path && !path.includes('..') && !path.includes('//')) paths.add(path);
  }
  return [...paths].sort();
}

export function normalizeComments(input) {
  const comments = Array.isArray(input) ? input : input?.comments;
  if (!Array.isArray(comments)) throw new Error('Expected a JSON array or {comments: array}');
  const seen = new Set();
  return comments.map((comment, index) => {
    if (!Number.isSafeInteger(comment?.id) || comment.id <= 0 || typeof comment.body !== 'string' ||
        typeof comment.created_at !== 'string' || !Number.isFinite(Date.parse(comment.created_at))) {
      throw new Error(`Incomplete issue comment at index ${index}: id/body/created_at required`);
    }
    if (seen.has(comment.id)) throw new Error(`Duplicate comment id ${comment.id}`);
    seen.add(comment.id);
    return { id: comment.id, createdAt: comment.created_at, body: comment.body };
  }).sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id-b.id);
}

function session(body) {
  return /^Session ID:\s*(WORLD-[A-Z0-9-]+)/mi.exec(body)?.[1] ?? null;
}

function releaseTargetIds(body) {
  // Only explicit references to the releasing session's earlier task claims.
  // Other '#...' references (for PRs, rival claims) must not release anyone.
  const matches = [];
  for (const line of body.split(/\r?\n/)) {
    if (!/(?:previous|prior|earlier|original|released|former)\s+(?:(?:task|own)\s+)?claim/i.test(line)) continue;
    for (const m of line.matchAll(/#(\d{7,})\b/g)) matches.push(Number(m[1]));
  }
  return [...new Set(matches)];
}

function matchesGlob(glob, path) {
  const escaped = glob.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

function pathOverlap(a,b) {
  if (a === b || a.endsWith('/') && b.startsWith(a) || b.endsWith('/') && a.startsWith(b)) return true;
  if (a.includes('*') && matchesGlob(a,b) || b.includes('*') && matchesGlob(b,a)) return true;
  return false;
}

export function auditClaims(input) {
  const comments = normalizeComments(input);
  const claims = [], ambiguousReleases = [];
  for (const comment of comments) {
    const first = comment.body.trimStart().split(/\r?\n/, 1)[0].trim();
    const owner = session(comment.body);
    if (CLAIM.test(first)) {
      claims.push({ commentId: comment.id, createdAt: comment.createdAt, sessionId: owner,
        files: expectedPaths(comment.body), released: false });
    } else if (RELEASE.test(first)) {
      const refs = releaseTargetIds(comment.body);
      let released = false;
      for (const ref of refs) {
        const prior = claims.find(c => c.commentId === ref && c.sessionId && c.sessionId === owner);
        if (prior) { prior.released = true; released = true; }
      }
      if (!released) ambiguousReleases.push({ commentId: comment.id, sessionId: owner, reason: 'No explicit matching earlier TASK CLAIM reference' });
    }
  }
  const active = claims.filter(c=>!c.released);
  const collisions = [];
  for (let i=0; i<active.length; i++) {
    for (let j=i+1; j<active.length; j++) {
      if (!active[i].sessionId || !active[j].sessionId || active[i].sessionId === active[j].sessionId) continue;
      for (const a of active[i].files) for (const b of active[j].files) {
        if (pathOverlap(a,b)) collisions.push({ earlierClaim: active[i].commentId, laterClaim: active[j].commentId,
          earlierSession: active[i].sessionId, laterSession: active[j].sessionId, earlierPath: a, laterPath: b });
      }
    }
  }
  return {
    source: 'GitHub issue #2233 TASK CLAIM comments (not PR edits or atomic locks)',
    commentsChecked: comments.length, claimsChecked: claims.length, activeClaims: active.length,
    releasedClaims: claims.length-active.length,
    collisions,
    unscopedClaims: active.filter(c=>!c.sessionId || c.files.length===0).map(c=>({commentId:c.commentId, sessionId:c.sessionId})),
    ambiguousReleases,
    caveat: 'Potential conflicts require GitHub comment-order/owner arbitration. Never infer staleness, merge permission, CI success or deployment from this report.'
  };
}

export async function fetchIssueComments({ repo = 'solarissongcontest/solarisstudio', issue = 2233, token = process.env.GITHUB_TOKEN, fetchImpl = fetch } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !Number.isSafeInteger(issue) || issue <= 0)
    throw new Error('Invalid repository/issue');
  const comments = [];
  for (let page=1;page<=20;page++) {
    const url = `https://api.github.com/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`;
    const res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`GitHub read failed (${res.status}) on page ${page}; cannot establish claim order`);
    const payload = await res.json();
    if (!Array.isArray(payload)) throw new Error(`GitHub page ${page} was not an array`);
    comments.push(...payload);
    if (payload.length < 100) return comments;
  }
  throw new Error('Issue exceeds 20 pages; refusing incomplete conflict audit');
}

async function cli() {
  const args = process.argv.slice(2);
  let input = null, json = false;
  for (let i=0;i<args.length;i++) {
    if (args[i]==='--input' && args[i+1]) input = args[++i];
    else if (args[i]==='--json') json = true;
    else if (args[i]==='--help') {
      console.log('Usage: node scripts/check-world-swarm-claims.mjs [--input comments.json] [--json]\nWithout --input, reads canonical public GitHub issue #2233 only. No mutations.');return;
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  const snapshot = input ? JSON.parse(await readFile(input,'utf8')) : await fetchIssueComments();
  const report = auditClaims(snapshot);
  if (json) console.log(JSON.stringify(report,null,2));
  else console.log(`${report.commentsChecked} comments, ${report.activeClaims} active claims; ${report.collisions.length} possible file overlaps, ${report.unscopedClaims.length} unscoped claims, ${report.ambiguousReleases.length} ambiguous releases.\n${report.collisions.slice(0,30).map(x=>`#${x.earlierClaim} (${x.earlierSession}) ↔ #${x.laterClaim} (${x.laterSession}): ${x.earlierPath} / ${x.laterPath}`).join('\n')}${report.collisions.length>30 ? '\n... use --json for all':' '}\n${report.caveat}`);
  if (report.collisions.length || report.unscopedClaims.length || report.ambiguousReleases.length) process.exitCode=2;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli().catch(err=>{console.error(`[world-claim-preflight] ${err.message}`);process.exitCode=3;});
}
