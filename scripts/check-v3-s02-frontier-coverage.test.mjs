import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {computeCoverage} from './check-v3-s02-frontier-coverage.mjs';
const load=n=>JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/'+n,import.meta.url),'utf8'));
const tables=load('s02-hosted-215-relation-fingerprints-2026-11-09.json');
const routines=load('s02-hosted-727-routine-fingerprints-2026-11-09.json');
const modelled=[...load('s02-hosted-s14-archive-45-table-catalog-2026-11-09.json').tables,
 ...load('s02-hosted-s14-archive-extra-2-tables-2026-11-09.json').tables,
 ...load('s02-hosted-s14-nine-parent-tables-2026-11-09.json').tables];
const copy=x=>JSON.parse(JSON.stringify(x));
describe('S02 full hosted-head coverage honesty',()=>{
 it('records exact 215/727 frontier and refuses full equivalence certification',()=>{
  const a=computeCoverage(tables,routines,modelled);
  expect(a).toMatchObject({fullHostedRelationCount:215,modelledArchiveRelationCount:56,
    unmodelledRelationCount:159,fullHostedEquivalenceCertified:false,
    productionDeploymentAuthorized:false,unmodelledBySchema:{auth:26,private:9,public:112,televoting:12}});
  expect(a.unmodelledRelationNames).toHaveLength(159);
 });
 it('fails on missing fingerprint, new unknown table, duplicated or absent modelled object',()=>{
  const a=copy(tables);a.relations.pop();
  expect(()=>computeCoverage(a,routines,modelled)).toThrow(/FAIL CLOSED/);
  const b=copy(tables);b.relations[0].sha256='unknown';
  expect(()=>computeCoverage(b,routines,modelled)).toThrow(/FAIL CLOSED/);
  const c=copy(modelled);c[0].name='unknown';
  expect(()=>computeCoverage(tables,routines,c)).toThrow(/FAIL CLOSED/);
  expect(()=>computeCoverage(tables,routines,modelled.slice(1))).toThrow(/FAIL CLOSED/);
 });
 it('fails on unverified function grant or stale migration head',()=>{
  const x=copy(routines);x.functions[0].exec.anon='unknown';
  expect(()=>computeCoverage(tables,x,modelled)).toThrow(/FAIL CLOSED/);
  const y=copy(routines);y.functions[0].sha256='not sha256';
  expect(()=>computeCoverage(tables,y,modelled)).toThrow(/FAIL CLOSED/);
  expect(()=>computeCoverage({...tables,hostedHead:'20261014020000'},routines,modelled)).toThrow(/FAIL CLOSED/);
 });
});
