#!/usr/bin/env node
// S02: compare local networkless PG17.11's 9 reconstructed external S14
// parent relations with dated, read-only HOSTED metadata. No network/SQL here.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {differences} from './verify-v3-s02-s14-catalog.mjs';

const source=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s02-hosted-s14-nine-parent-tables-2026-11-09.json',import.meta.url),'utf8'));
export function compareParentCatalog(observed,expected=source){
 if(!expected || !expected.schemaOnly || expected.serverVersionNum!=='170011' ||
    expected.tables?.length!==9 || observed?.length!==9 ||
    expected.counts?.columns!==136 || expected.counts?.constraints!==42 ||
    expected.counts?.indexes!==36 || expected.counts?.triggers!==20 || expected.counts?.policies!==30)
    throw Error('FAIL CLOSED: nine-parent hosted/local relation coverage is missing');
 const sorter=rows=>[...rows].sort((a,b)=>(a.schema+'.'+a.name).localeCompare(b.schema+'.'+b.name));
 const diff=differences(sorter(expected.tables),sorter(observed));
 if(diff.length)throw Error('FAIL CLOSED: hosted/local S14 parent relation catalog drift '+JSON.stringify(diff).slice(0,15000));
 return {task:'S02',scope:'9 directly observed S14 Archive external parent tables',
  relations:9,columns:136,constraints:42,indexes:36,triggers:20,policies:30,
  fullHostedEquivalenceCertified:false,productionDeploymentAuthorized:false,
  limitation:'Only 56 combined hosted-observed S14 relations; runtime dependency and production upgrade still require review'};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4)throw Error('Usage: node scripts/verify-v3-s02-parent-catalog.mjs observed.json proof.json');
  for(const key of ['DATABASE_URL','POSTGRES_URL','SUPABASE_URL','SUPABASE_DB_URL','PGHOST','PGHOSTADDR','DOCKER_HOST'])
    if(process.env[key])throw Error('FAIL CLOSED: unexpected hosted connection alias '+key);
  const local=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
  const proof={...compareParentCatalog(local),sourceDate:'2026-11-09',environment:'networkless-disposable-postgres-17.11'};
  writeFileSync(resolve(process.argv[3]),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
  console.log('PASS: all nine S14 external parent catalogs match hosted-observed metadata');
 }catch(e){console.error(e.message);process.exitCode=1}
}
