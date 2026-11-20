// Deterministic packaging of the EXISTING S13 candidate; never executes SQL/network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export const candidate='docs/v3/recovery-candidates/forward-only-s13-foundation.sql';
export const inputs=[candidate,...['preconditions','dark-acl','postconditions'].map(x=>'docs/v3/recovery-candidates/s13-first-batch-'+x+'.sql')];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function renderBatch(){
 const source=fs.readFileSync(path.join(root,candidate),'utf8');
 assert.equal(digest(source),'d9463fbb1399261f0a05d1f6ab1ab08ba8e07b9d5c1821feaddd95e9ce53d14d','Existing candidate changed: explicit requalification required');
 assert.equal((source.match(/^begin;$/gm)||[]).length,1);
 assert.equal((source.match(/^commit;$/gm)||[]).length,1);
 const fragments=inputs.slice(1).map(p=>fs.readFileSync(path.join(root,p),'utf8'));
 const bodies=new Map();
 const functions=[...source.matchAll(/^create or replace function public\.(\w+)\([\s\S]*?^as\s+(\$[a-z_]*\$)([\s\S]*?)\2;/gm)];
 for(const m of functions)bodies.set(m[1],digest(m[3]));
 assert.equal(bodies.size,7,'Canonical function body extraction drift');
 const rows=[...bodies].map(([name,sha])=>"('"+name+"','"+sha+"')").join(',');
 const definitions="do $s13_batch_bodies$ declare r record; begin for r in select * from (values "+rows+") v(name,hash) loop if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r.name and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=r.hash and p.prorettype='jsonb'::regtype and p.prokind='f' and not p.proleakproof and not p.proisstrict) then raise exception 'S13 exact function body differs: %',r.name using errcode='55000'; end if; end loop; end $s13_batch_bodies$;\n";
 const post=fragments[2]+'\n'+definitions;
 const core=source.slice(source.indexOf('\nbegin;')+1).replace(/^begin;\n/,'').replace(/\ncommit;\s*$/,'');
 const header='-- S13-FOUNDATION-DARK-1: forward-only control-plane installation, not activation.\n-- Execute ONLY approved bytes against the independently verified target.\n';
 return {
  'preflight.sql':'begin transaction read only;\nset local lock_timeout=\'2s\';\nset local statement_timeout=\'10s\';\n'+fragments[0]+source.slice(source.indexOf('do $v3_s13_recovery_preflight$'),source.indexOf('-- Unmodified core S13'))+'\ncommit;\n',
  'install.sql':header+'begin;\nset local lock_timeout=\'5s\';\nset local statement_timeout=\'120s\';\nset local search_path=pg_catalog,public,private;\n'+fragments[0]+core+'\n'+fragments[1]+'\n'+post+'\ncommit;\n',
  'postcheck.sql':'begin transaction read only;\nset local statement_timeout=\'10s\';\nset local lock_timeout=\'2s\';\n'+post+"\nselect 'S13-FOUNDATION-DARK-1 postconditions passed; no API writers activated' as status;\ncommit;\n"
 };
}
export function packageBatch(output){
 const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const sourcePaths=[...inputs,'scripts/package-v3-s13-first-batch.mjs','scripts/rehearse-v3-s13-first-batch.py'];
 for(const p of sourcePaths){
  const expected=execFileSync('git',['show',sha+':'+p],{cwd:root});
  assert.equal(digest(expected),digest(fs.readFileSync(path.join(root,p))),'Uncommitted batch source: '+p);
 }
 fs.mkdirSync(output,{recursive:false,mode:0o700});
 const sql=renderBatch();
 for(const [name,bytes]of Object.entries(sql))fs.writeFileSync(path.join(output,name),bytes,{flag:'wx',mode:0o600});
 const manifest={schemaVersion:1,batchId:'S13-FOUNDATION-DARK-1',sourceSha:sha,target:{projectRef:'dkxmnvekiopyesuzggeu',database:'postgres',postgresVersionNum:170011,actor:'postgres'},
  scope:{privateTables:5,publicRpcs:7,secondaryIndexes:2,semanticContractSeeds:2,supabaseHistoryWrites:0,existingContestRowWrites:0,apiMutationRpcsEnabled:0},
  order:['preflight.sql','install.sql','postcheck.sql'],artifacts:Object.fromEntries(Object.entries(sql).map(([name,bytes])=>[name,{sha256:digest(bytes),bytes:Buffer.byteLength(bytes)}])),
  inputs:sourcePaths.map(p=>({path:p,sha256:digest(fs.readFileSync(path.join(root,p)))})),
  transaction:'One install transaction; stop on every error; 5s lock /120s statement timeout; transaction advisory lock',
  retry:'Before commit: rollback then identical guarded retry. After commit: duplicate refused; inspect postchecks; never drop/replay.',
  rollback:'Transactional rollback before commit. After commit: leave new owner-only metadata installed and repair forward; do not restore over live data or drop dependencies.',
  authVaultAreSqlDependencies:false,productionAuthorized:false,qualification:{recoveredPrivateDatabaseRehearsal:false,livePreflightFresh:false,status:'AWAITING_BATCH_SPECIFIC_EVIDENCE'},
  evidence:['docs/v3/recovery-candidates/evidence/s13-current-hosted-preflight-2026-11-19.json','docs/v3/recovery-candidates/evidence/s13-s16-current-hosted-catalog-2026-11-20.json']};
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3,'Usage: node scripts/package-v3-s13-first-batch.mjs <NEW-private-output-directory>');
 console.log(JSON.stringify(packageBatch(path.resolve(process.argv[2])),null,2));
}
