#!/usr/bin/env node
// S02: identify unmodelled HOSTED objects, never certify from an incomplete
// 56-table reconstruction. Local JSON files only; zero Supabase/network calls.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function read(name){return JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/'+name,import.meta.url),'utf8'))}
const hostedTables=read('s02-hosted-215-relation-fingerprints-2026-11-09.json');
const hostedRoutines=read('s02-hosted-727-routine-fingerprints-2026-11-09.json');
const a45=read('s02-hosted-s14-archive-45-table-catalog-2026-11-09.json');
const a2=read('s02-hosted-s14-archive-extra-2-tables-2026-11-09.json');
const a9=read('s02-hosted-s14-nine-parent-tables-2026-11-09.json');
const expectedCounters={tables:215,columns:2364,constraints:1206,indexes:669,triggers:289,policies:255};
const id=t=>t.schema+'.'+t.name;
export function computeCoverage(tableSnapshot=hostedTables,routineSnapshot=hostedRoutines,replayed=[...a45.tables,...a2.tables,...a9.tables]){
  if(!tableSnapshot || !routineSnapshot ||
     tableSnapshot.hostedHead!=='20261101181812' ||
     routineSnapshot.hostedHead!==tableSnapshot.hostedHead ||
     tableSnapshot.serverVersionNum!=='170011' ||
     routineSnapshot.serverVersionNum!=='170011')
     throw Error('FAIL CLOSED: stale hosted migration frontier or unsupported PostgreSQL version');
  for(const [key,value] of Object.entries(expectedCounters))
    if(tableSnapshot[key]!==value)throw Error('FAIL CLOSED: incomplete hosted table count: '+key);
  if(!Array.isArray(tableSnapshot.relations)||tableSnapshot.relations.length!==215||
     !Array.isArray(routineSnapshot.functions)||routineSnapshot.functions.length!==727||
     routineSnapshot.count!==727||!Array.isArray(replayed)||replayed.length!==56)
    throw Error('FAIL CLOSED: unknown hosted object inventory or fixture coverage');
  const all=new Set(tableSnapshot.relations.map(x=>x.id));
  const covered=new Set(replayed.map(id));
  const routines=new Set(routineSnapshot.functions.map(x=>x.id));
  if(all.size!==215||covered.size!==56||routines.size!==727 ||
     [...covered].some(x=>!all.has(x)) ||
     [...tableSnapshot.relations].some(x=>!/^([a-f0-9]{64})$/.test(x.sha256)) ||
     [...routineSnapshot.functions].some(x=>!/^([a-f0-9]{64})$/.test(x.sha256)))
     throw Error('FAIL CLOSED: missing, duplicate or unsupported hosted identity/fingerprint');
  for(const x of routineSnapshot.functions)if(!x.exec ||
     ['anon','authenticated','service_role'].some(k=>typeof x.exec[k]!=='boolean') ||
     typeof x.securityDefiner!=='boolean')
     throw Error('FAIL CLOSED: unknown hosted function privilege identity');
  const unmodelled=[...all].filter(x=>!covered.has(x)).sort();
  if(unmodelled.length!==159)throw Error('FAIL CLOSED: unmodelled hosted table frontier changed');
  const counts=Object.fromEntries(['auth','private','public','televoting'].map(s=>
    [s,unmodelled.filter(n=>n.startsWith(s+'.')).length]));
  if(counts.auth!==26||counts.private!==9||counts.public!==112||counts.televoting!==12)
    throw Error('FAIL CLOSED: unknown unmodelled relation distribution');
  return {
    task:'S02',
    status:'SCOPED_S13_S14_ARCHIVE_TELEVOTE_REHEARSAL_ONLY',
    observedHostedHead:tableSnapshot.hostedHead,
    observedPgVersion:tableSnapshot.serverVersionNum,
    fullHostedRelationCount:215,
    modelledArchiveRelationCount:56,
    unmodelledRelationCount:159,
    unmodelledBySchema:counts,
    unmodelledRelationNames:unmodelled,
    functionSignaturesFingerprinted:727,
    functionsWhoseCompleteBehaviorIsCertified:0,
    hostedTableCatalogTotals:Object.fromEntries(Object.keys(expectedCounters).map(k=>[k,tableSnapshot[k]])),
    fullHostedEquivalenceCertified:false,
    productionDeploymentAuthorized:false,
    blockers:[
     '159 real hosted relations not reconstructed in the isolated fixture',
     '727 hosted function signatures/fingerprints observed but complete runtime semantics not independently reproduced',
     'Only S14 Archive and Televote candidate installation rehearsals have been exercised, not all production rows or remaining critical domains',
     'S01 36 missing hosted migration-history entries still require independent effect reconciliation'
    ]
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3)throw Error('Usage: node scripts/check-v3-s02-frontier-coverage.mjs out-proof.json');
    const report=computeCoverage();
    writeFileSync(resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('PASS: honest S02 coverage, 56/215 hosted tables; 159 still unmodelled. FULL equivalence NOT certified.');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
