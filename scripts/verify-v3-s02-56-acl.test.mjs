import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {compareAclEvidence} from './verify-v3-s02-56-acl.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/'+n,import.meta.url),'utf8'));
const tbl=read('s02-hosted-s14-56-table-acls-2026-11-09.json');
const sch=read('s02-hosted-s14-schema-acls-2026-11-09.json');
const good={tables:Object.entries(tbl.privileges).map(([relation,roles])=>({relation,roles})),
 schemas:Object.entries(sch.privileges).map(([schema,roles])=>({schema,roles}))};
const copy=x=>JSON.parse(JSON.stringify(x));
describe('S02 hosted-observed 56-table role privileges',()=>{
 it('matches all expected CRUD and schema bits',()=>{
  expect(compareAclEvidence(copy(good))).toMatchObject({tables:56,schemaNamespaces:4,tableCrudBits:672,fullHostedEquivalenceCertified:false});
 });
 it('rejects missing/unknown and conflicting grant bits',()=>{
  const edits=[
    x=>x.tables.pop(),
    x=>x.tables[0].relation='fake',
    x=>x.tables[0].roles.anon.SELECT=!x.tables[0].roles.anon.SELECT,
    x=>x.tables[0].roles.authenticated.INSERT=!x.tables[0].roles.authenticated.INSERT,
    x=>x.schemas[0].roles.anon.USAGE=!x.schemas[0].roles.anon.USAGE,
    x=>x.schemas[0].roles.service_role.CREATE=!x.schemas[0].roles.service_role.CREATE,
  ];
  for(const edit of edits){
   const x=copy(good);edit(x);
   expect(()=>compareAclEvidence(x)).toThrow(/FAIL CLOSED/);
  }
 });
 it('refuses stale/incomplete hosted evidence',()=>{
  expect(()=>compareAclEvidence(copy(good),{...tbl,privilegeBits:671},sch)).toThrow(/FAIL CLOSED/);
  expect(()=>compareAclEvidence(copy(good),tbl,{...sch,privileges:{}})).toThrow(/FAIL CLOSED/);
 });
});
