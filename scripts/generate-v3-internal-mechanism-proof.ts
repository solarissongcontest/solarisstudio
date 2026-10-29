import { readFileSync, writeFileSync } from 'node:fs';
import { V3_INTERNAL_MECHANISM_CONTRACTS } from '../src/lib/v3-s16-internal-mechanism-contracts';
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!output) throw new Error('--out=<disposable SQL fixture> required');
const proofFile=process.argv.find(a=>a.startsWith('--proof-file='))?.slice(13)??'.github/tests/v3-televote-internal-mechanisms.sql';
const json=JSON.stringify(V3_INTERNAL_MECHANISM_CONTRACTS.filter(c=>c.proof===proofFile)).replaceAll("'","''");
writeFileSync(output,readFileSync(proofFile,'utf8').replace('-- CONTRACTS',`select set_config('test.internal_mechanisms','${json}',true);`));
