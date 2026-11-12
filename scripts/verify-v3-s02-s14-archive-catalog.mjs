#!/usr/bin/env node
// S02: strict 56-relation catalog parity against OWNER-OBSERVED 2026-11-09
// hosted snapshots. Local files and process only: no DB/hosted network calls.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {differences} from './verify-v3-s02-s14-catalog.mjs';

const read=(name)=>JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/'+name,import.meta.url),'utf8'));
const expected45=read('s02-hosted-s14-archive-45-table-catalog-2026-11-09.json');
const expected2=read('s02-hosted-s14-archive-extra-2-tables-2026-11-09.json');
const expected9=read('s02-hosted-s14-nine-parent-tables-2026-11-09.json');
function tally(tables, field){return tables.reduce((n,t)=>n+t[field].length,0);}
export function compareArchiveCatalog(actual, a45=expected45, a2=expected2, a9=expected9){
 if(a45?.serverVersionNum!=='170011'||a45.tables?.length!==45||a2.tables?.length!==2||a9.tables?.length!==9||
   !a45.schemaOnly||!a2.schemaOnly||!a9.schemaOnly||a9.serverVersionNum!=='170011'||!Array.isArray(actual)||actual.length!==56)
   throw Error('FAIL CLOSED: 56-relation hosted observation or local catalog missing');
 const source=[...a45.tables,...a2.tables,...a9.tables];
 const sort=(x)=>[...x].sort((a,b)=>(a.schema+'.'+a.name).localeCompare(b.schema+'.'+b.name));
 const diffs=differences(sort(source),sort(actual));
 if(diffs.length)throw Error('FAIL CLOSED: hosted/local S14 Archive catalog drift: '+JSON.stringify(diffs).slice(0,12000));
 return {relations:56,columns:tally(source,'columns'),constraints:tally(source,'constraints'),
   indexes:tally(source,'indexes'),triggers:tally(source,'triggers'),policies:tally(source,'policies'),
   fullHostedEquivalenceCertified:false,productionDeploymentAuthorized:false,
   limitation:'56 hosted-observed S14 Archive relations; function-body/runtime dependency closure and full production schema remain unverified'};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4)throw Error('Usage: node scripts/verify-v3-s02-s14-archive-catalog.mjs actual-local-catalog.json proof.json');
  for(const x of ['SUPABASE_URL','DATABASE_URL','SUPABASE_DB_URL','POSTGRES_URL','PGHOST','PGHOSTADDR','DOCKER_HOST']) if(process.env[x])throw Error('FAIL CLOSED: inherited remote endpoint '+x);
  const actual=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
  const result=compareArchiveCatalog(actual);
  writeFileSync(resolve(process.argv[3]),JSON.stringify({task:'S02',source:'2026-11-09 read-only hosted PG17.11 catalog',...result},null,2)+'\n',{flag:'wx'});
  console.log('PASS: isolated PG17.11 matches all 56 hosted-observed S14 Archive relation catalogs');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
