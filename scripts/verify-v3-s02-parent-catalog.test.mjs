import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {compareParentCatalog} from './verify-v3-s02-parent-catalog.mjs';
const hosted=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s02-hosted-s14-nine-parent-tables-2026-11-09.json',import.meta.url),'utf8'));
const copy=x=>JSON.parse(JSON.stringify(x));
describe('S02 9 hosted-observed external parent catalogs',()=>{
 it('accepts only exact complete nine-parent evidence',()=>{
  expect(compareParentCatalog(copy(hosted.tables))).toMatchObject({relations:9,columns:136,policies:30,fullHostedEquivalenceCertified:false});
 });
 it('rejects a missing parent, unknown parent, incomplete host baseline',()=>{
  expect(()=>compareParentCatalog(copy(hosted.tables.slice(1)))).toThrow(/FAIL CLOSED/);
  const x=copy(hosted.tables);x[0].name='invented';
  expect(()=>compareParentCatalog(x)).toThrow(/FAIL CLOSED/);
  expect(()=>compareParentCatalog(hosted.tables,{...hosted,counts:{...hosted.counts,policies:29}})).toThrow(/FAIL CLOSED/);
 });
 it('rejects security/column/index/trigger/constraint drift',()=>{
  const edits=[
   x=>x[0].owner='postgres',
   x=>x[0].columns[0].notnull=!x[0].columns[0].notnull,
   x=>x[0].indexes[0].valid=false,
   x=>x.find(t=>t.name==='countries'&&t.schema==='public').triggers[0].enabled='D',
   x=>x.find(t=>t.schema==='public'&&t.name==='countries').policies[0].using='true',
   x=>x[0].constraints[0].validated=false,
  ];
  for(const edit of edits){const x=copy(hosted.tables);edit(x);expect(()=>compareParentCatalog(x)).toThrow(/FAIL CLOSED/);}
 });
});
