#!/usr/bin/env node
// S02: strict hosted-role ACL bit parity over the 56 observed S14 relations
// and four PG schemas. Local JSON only; no database/hosted endpoints.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {differences} from './verify-v3-s02-s14-catalog.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/'+n,import.meta.url),'utf8'));
const table=read('s02-hosted-s14-56-table-acls-2026-11-09.json');
const schema=read('s02-hosted-s14-schema-acls-2026-11-09.json');
export function compareAclEvidence(actual,expTables=table,expSchemas=schema){
 if(!actual||actual.tables?.length!==56||actual.schemas?.length!==4||
    expTables?.relations!==56||expTables.privilegeBits!==672||
    Object.keys(expTables.privileges||{}).length!==56||
    Object.keys(expSchemas.privileges||{}).length!==4)
  throw Error('FAIL CLOSED: missing or extra S02 hosted/local role ACL evidence');
 const local=Object.fromEntries(actual.tables.map(x=>[x.relation,x.roles]));
 const sc=Object.fromEntries(actual.schemas.map(x=>[x.schema,x.roles]));
 if(Object.keys(local).length!==56||Object.keys(sc).length!==4)
  throw Error('FAIL CLOSED: duplicated or unknown S02 privilege identities');
 const errs=[...differences(expTables.privileges,local),...differences(expSchemas.privileges,sc)];
 if(errs.length)throw Error('FAIL CLOSED: hosted/local role GRANT mismatch: '+JSON.stringify(errs).slice(0,12000));
 return {tables:56,schemaNamespaces:4,tableCrudBits:672,schemaRightsBits:24,
   scope:'anon/authenticated/service_role CREATE+USAGE and CRUD privileges',
   fullHostedEquivalenceCertified:false,productionDeploymentAuthorized:false,
   limitation:'RLS row-level decisions and function EXECUTE permissions must be verified independently'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4)throw Error('Usage: node scripts/verify-v3-s02-56-acl.mjs local.json proof.json');
  for(const v of ['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_URL','PGHOST','PGHOSTADDR','DOCKER_HOST'])
   if(process.env[v])throw Error('FAIL CLOSED: hosted endpoint or remote Docker alias '+v);
  const actual=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
  const summary=compareAclEvidence(actual);
  writeFileSync(resolve(process.argv[3]),JSON.stringify({task:'S02',date:'2026-11-09',environment:'networkless-disposable-pg17.11',...summary},null,2)+'\n',{flag:'wx'});
  console.log('PASS: 56 local S14 tables and four schemas match hosted-observed Data API role privilege bits');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
