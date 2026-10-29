import {execFileSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
const helper='.github/scripts/v3-integrity-edge-readiness.sh';
function run(body:string){return execFileSync('bash',['-c',`set -euo pipefail; source '${helper}'; ${body}`],{encoding:'utf8',timeout:3000});}
describe('Integrity Edge readiness',()=>{
 it('requires the real handler denial, not any non-5xx gateway response',()=>{
  expect(run(`n=0; sleep(){ :; }; request(){ n=$((n+1)); if (( n==1 )); then HTTP_STATUS=404; HTTP_BODY='not found'; else HTTP_STATUS=401; HTTP_BODY='{"error":"Your session has expired."}'; fi; }; wait_for_integrity_edge $$ http://127.0.0.1 local /dev/null; echo "$n"`)).toBe('2\n');
 });
 it('fails immediately when the runtime has crashed, without accepting a stale response',()=>{
  expect(run(`request(){ echo 'unexpected request'; }; if wait_for_integrity_edge 2147483647 http://127.0.0.1 local /dev/null 2>/dev/null; then exit 9; fi; echo denied`)).toBe('denied\n');
 });
 it('bounds the startup request and keeps transient listener failures retryable',()=>{
  expect(run(`n=0; sleep(){ :; }; request(){ [[ "$REQUEST_TIMEOUT" == 5 ]]; n=$((n+1)); HTTP_STATUS=000; HTTP_BODY=''; if (( n==2 )); then HTTP_STATUS=401; HTTP_BODY='{"error":"Your session has expired."}'; fi; }; wait_for_integrity_edge $$ http://127.0.0.1 local /dev/null; echo "$n"`)).toBe('2\n');
 });
});
