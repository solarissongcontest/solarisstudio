import { readFileSync, writeFileSync } from 'node:fs';
import { V3_INTERNAL_MECHANISM_CONTRACTS, V3_INTERNAL_CALLER_CONTRACTS } from '../src/lib/v3-s16-internal-mechanism-contracts';
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!output) throw new Error('--out=<disposable SQL fixture> required');
const proofFile=process.argv.find(a=>a.startsWith('--proof-file='))?.slice(13)??'.github/tests/v3-televote-internal-mechanisms.sql';
const mechanisms=V3_INTERNAL_MECHANISM_CONTRACTS.filter(c=>c.proof===proofFile);
if (!mechanisms.length) throw new Error(`No reviewed mechanism contracts for ${proofFile}`);
const required=new Set(mechanisms.flatMap(c=>c.callerSignatures));
let previous=-1;
while (previous!==required.size) {
  previous=required.size;
  for (const caller of V3_INTERNAL_CALLER_CONTRACTS) if (required.has(caller.signature)) {
    for (const ancestor of caller.callerSignatures) required.add(ancestor);
  }
}
const json=JSON.stringify(mechanisms).replaceAll("'","''");
const callers=JSON.stringify(V3_INTERNAL_CALLER_CONTRACTS.filter(c=>required.has(c.signature))).replaceAll("'","''");
const source=readFileSync(proofFile,'utf8');
if (!source.includes('-- CONTRACTS')) throw new Error(`Missing executable contract insertion point in ${proofFile}`);
writeFileSync(output,source.replace('-- CONTRACTS',`select set_config('test.internal_mechanisms','${json}',true);\nselect set_config('test.internal_callers','${callers}',true);`));
