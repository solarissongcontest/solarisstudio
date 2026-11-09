import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {compareArchiveCatalog} from './verify-v3-s02-s14-archive-catalog.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/'+n,import.meta.url),'utf8'));
const first=read('s02-hosted-s14-archive-45-table-catalog-2026-11-09.json'),extra=read('s02-hosted-s14-archive-extra-2-tables-2026-11-09.json');
const copy=x=>JSON.parse(JSON.stringify(x));
const observed=[...first.tables,...extra.tables];
describe('S02 47-table hosted S14 archive catalog (offline)',()=>{
 it('accepts complete exact observed source scope without pretending full equivalence',()=>{
  const proof=compareArchiveCatalog(copy(observed));
  expect(proof).toMatchObject({relations:47,columns:722,constraints:339,triggers:166,policies:107,fullHostedEquivalenceCertified:false});
 });
 it('fails closed on missing/extra tables or incomplete observations',()=>{
  expect(()=>compareArchiveCatalog(observed.slice(1))).toThrow(/FAIL CLOSED/);
  expect(()=>compareArchiveCatalog(observed,{...first,serverVersionNum:'160011'},extra)).toThrow(/FAIL CLOSED/);
  expect(()=>compareArchiveCatalog(observed,first,{...extra,tables:[]})).toThrow(/FAIL CLOSED/);
 });
 it('detects mutation of a security-critical policy, index, trigger, column or RLS bit',()=>{
  const edits=[
   x=>x[0].rls=!x[0].rls,
   x=>x[0].columns[0].notnull=!x[0].columns[0].notnull,
   x=>x[0].constraints[0].validated=false,
   x=>x[0].indexes[0].valid=false,
   x=>x.find(t=>t.name==='admin_notifications').triggers[0].enabled='D',
   x=>x.find(t=>t.name==='admin_notifications').policies[0].using='true',
  ];
  for(const edit of edits){const changed=copy(observed);edit(changed);expect(()=>compareArchiveCatalog(changed)).toThrow(/FAIL CLOSED/);}
 });
});
