#!/usr/bin/env node
/**
 * TG19 source contract: TG2 renamed world_office_terms.starts_at/ends_at.
 * This offline, read-only guard checks post-alignment World migrations. It is
 * NOT a SQL parser, migration rehearsal, RLS proof, or release certificate.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ALIGNMENT = '20261102171700';
const DIRECTORY = 'supabase/migrations/';
const FILE_NAME = /^(\d{14})_[a-zA-Z0-9][a-zA-Z0-9_.-]*\.sql$/;
const NEW_NAME = { starts_at: 'started_at', ends_at: 'actual_end_at' };
const NON_ALIASES = new Set(['where','on','set','using','returning','group','order','limit','inner','left','right','full','cross','join','into']);

export function eligibleMigration(path) {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized.startsWith(DIRECTORY)) throw new Error('Not a migration path: ' + path);
  const rest = normalized.slice(DIRECTORY.length);
  if (rest.includes('/') || rest.includes('..')) throw new Error('Unsafe migration path: ' + path);
  const match = FILE_NAME.exec(rest);
  if (!match) throw new Error('Not a timestamped SQL migration: ' + path);
  return match[1] > ALIGNMENT;
}

// Keep line breaks and SQL string literals intact while ignoring commented SQL.
// Nested PostgreSQL block comments are supported.
export function blankComments(sql) {
  let out = '', state = 'normal', depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], n = sql[i + 1];
    if (state === 'line') {
      if (c === '\n') { state = 'normal'; out += c; } else out += ' ';
      continue;
    }
    if (state === 'block') {
      if (c === '/' && n === '*') { depth++; out += '  '; i++; continue; }
      if (c === '*' && n === '/') { depth--; out += '  '; i++; if (!depth) state = 'normal'; continue; }
      out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (state === 'quote') {
      out += c;
      if (c === "'" && n === "'") { out += n; i++; }
      else if (c === "'") state = 'normal';
      continue;
    }
    if (c === "'") { state = 'quote'; out += c; continue; }
    if (c === '-' && n === '-') { state = 'line'; out += '  '; i++; continue; }
    if (c === '/' && n === '*') { state = 'block'; depth = 1; out += '  '; i++; continue; }
    out += c;
  }
  return out;
}

function lineOf(source, index) {
  return 1 + (source.slice(0, index).match(/\n/g)?.length || 0);
}

export function scanOfficeTermSql(source, file) {
  const sql = blankComments(source), found = [], seen = new Set();
  const emit = (index, field, code) => {
    if (seen.has(index)) return;
    seen.add(index);
    found.push({
      file, line: lineOf(sql, index), code,
      detail: 'TG2 renamed world_office_terms.' + field + ' to ' + NEW_NAME[field] + '.'
    });
  };

  // Alias resolution stays within a CREATE FUNCTION / DO segment, not across
  // unrelated functions which may reuse common aliases such as term.
  const sections = [0];
  const sectionStart = /^\s*(?:create\s+(?:or\s+replace\s+)?function|do\s+\$[^\n]*\$)/gim;
  for (const match of sql.matchAll(sectionStart)) if (match.index > 0) sections.push(match.index);
  sections.sort((a,b) => a-b);
  sections.push(sql.length);

  for (let s=0; s<sections.length-1; s++) {
    const offset=sections[s], chunk=sql.slice(offset,sections[s+1]);
    if (!/\b(?:public\.)?world_office_terms\b/i.test(chunk)) continue;
    const aliases = new Set(['world_office_terms']);
    let match;
    const tableRef=/\b(?:from|join|update)\s+(?:public\.)?world_office_terms\b(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
    while ((match=tableRef.exec(chunk))) {
      const alias=match[1]?.toLowerCase();
      if (alias && !NON_ALIASES.has(alias)) aliases.add(alias);
    }
    const recordRef=/\binto\s+(?:strict\s+)?([a-z_][a-z0-9_]*)\s+from\s+(?:public\.)?world_office_terms\b/gi;
    while ((match=recordRef.exec(chunk))) aliases.add(match[1].toLowerCase());

    for (const alias of aliases) for (const field of Object.keys(NEW_NAME)) {
      const regex = new RegExp('\\b' + alias + '\\s*\\.\\s*' + field + '\\b','gi');
      for (const m of chunk.matchAll(regex)) emit(offset+m.index,field,'stale_office_term_field');
    }

    const insert=/\binsert\s+into\s+(?:public\.)?world_office_terms\s*\(([^)]*)\)/gi;
    for (const m of chunk.matchAll(insert)) for (const field of Object.keys(NEW_NAME)) {
      const fm=new RegExp('\\b'+field+'\\b','i').exec(m[1]);
      if (fm) emit(offset+m.index+m[0].indexOf('(')+1+fm.index,field,'stale_office_term_insert_column');
    }
    const update=/\bupdate\s+(?:public\.)?world_office_terms(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s+set\s+([\s\S]*?)(?:\bwhere\b|\breturning\b|;|$)/gi;
    for (const m of chunk.matchAll(update)) for (const field of Object.keys(NEW_NAME)) {
      const fm=new RegExp('\\b'+field+'\\s*=','i').exec(m[1]);
      if (fm) emit(offset+m.index+m[0].indexOf(m[1])+fm.index,field,'stale_office_term_update_column');
    }
  }
  return found.sort((a,b)=>a.line-b.line||a.code.localeCompare(b.code));
}

export function auditOfficeTermMigrations(files) {
  if (!files.length) throw new Error('No migrations provided; no scan can be claimed.');
  const checked=[], skippedHistorical=[], findings=[];
  for (const file of files) {
    if (!eligibleMigration(file.path)) { skippedHistorical.push(file.path); continue; }
    if (typeof file.content !== 'string') throw new Error('SQL unavailable: '+file.path);
    checked.push(file.path);
    findings.push(...scanOfficeTermSql(file.content,file.path));
  }
  if (!checked.length) throw new Error('No post-alignment migration inspected.');
  return {
    status:findings.length?'fail':'pass',
    tg2Alignment:ALIGNMENT,
    canonicalOfficeFields:['started_at','actual_end_at'],
    checked,skippedHistorical,findings,
    caveat:'Source check only. No database execution, RLS proof, migration adoption, merge permission or certification.'
  };
}

function parseArgs(argv) {
  const opt={root:process.cwd(),files:[],base:null};
  for(let i=0;i<argv.length;i++){
    const k=argv[i];
    if(k==='--help') return {help:true};
    if(!['--root','--base','--file'].includes(k)||!argv[i+1]) throw new Error('Unexpected or incomplete argument: '+k);
    const v=argv[++i];
    if(k==='--root') opt.root=resolve(v);
    if(k==='--base'){if(opt.base) throw new Error('Duplicate --base'); opt.base=v;}
    if(k==='--file') opt.files.push(v);
  }
  if(Boolean(opt.base)===Boolean(opt.files.length)) throw new Error('Choose --base or one or more --file paths, not both.');
  return opt;
}

function changedMigrations(root,base) {
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(base)||base.includes('..')) throw new Error('Invalid base ref');
  const proc=spawnSync('git',['diff','--name-only','--diff-filter=ACMRT',base+'...HEAD','--',DIRECTORY],
    {cwd:root,encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
  if(proc.error||proc.status!==0) throw new Error('Offline git diff unavailable: '+String(proc.error?.message||proc.stderr||proc.status).trim());
  return proc.stdout.trim()?proc.stdout.trim().split(/\r?\n/):[];
}

export function main(argv) {
  const opt=parseArgs(argv);
  if(opt.help){
    process.stdout.write('Usage: node scripts/check-v3-world-office-schema-compat.mjs (--base <local-git-ref> | --file <supabase/migrations/version_name.sql> [--file ...]) [--root <repo>]\nRead-only. No Supabase/network access. Not a release certificate.\n');
    return 0;
  }
  const paths=[...new Set(opt.base?changedMigrations(opt.root,opt.base):opt.files)];
  const files=paths.map(path=>{
    eligibleMigration(path);
    const full=resolve(opt.root,path), rel=relative(opt.root,full);
    if(rel==='..'||rel.startsWith('..'+sep)) throw new Error('Path escaped repository');
    return {path,content:readFileSync(full,'utf8')};
  });
  const result=auditOfficeTermMigrations(files);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  return result.findings.length?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{ process.exitCode=main(process.argv.slice(2)); }
  catch(error){process.stderr.write('World office schema UNVERIFIED: '+String(error.message||error)+'\n');process.exitCode=2;}
}
