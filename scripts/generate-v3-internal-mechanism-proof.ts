import { readFileSync, writeFileSync } from 'node:fs';
import { V3_INTERNAL_MECHANISM_CONTRACTS } from '../src/lib/v3-s16-internal-mechanism-contracts';
const output=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!output) throw new Error('--out=<disposable SQL fixture> required');
const json=JSON.stringify(V3_INTERNAL_MECHANISM_CONTRACTS).replaceAll("'","''");
writeFileSync(output,readFileSync('.github/tests/v3-televote-internal-mechanisms.sql','utf8').replace('-- CONTRACTS',`select set_config('test.internal_mechanisms','${json}',true);`));
