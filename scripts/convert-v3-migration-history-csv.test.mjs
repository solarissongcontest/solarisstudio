import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const script = resolve(new URL('./convert-v3-migration-history-csv.mjs', import.meta.url).pathname);
function testCase(input, flags = []) {
  const root = mkdtempSync(join(tmpdir(), 'solaris-migration-csv-local-'));
  const raw = join(root, 'history.csv'), output = join(root, 'history.json');
  writeFileSync(raw, input, 'utf8');
  const call = () => spawnSync(process.execPath, [script, '--csv', raw, '--output', output, ...flags], {encoding:'utf8'});
  return {root, raw, output, call, cleanup:() => rmSync(root, {recursive:true, force:true})};
}
const good = 'version,name\r\n20261001202836,bootstrap_example\r\n20261101181812,v3_s13_adopt_rules_v4_1_roleplay_registry\r\n';

test('validates and converts CSV bytes into exact comparator JSON without fabricating project identity', () => {
  const f = testCase(good, ['--expected-count','2']);
  try {
    const outcome = f.call();
    assert.equal(outcome.status,0,outcome.stderr);
    const result = JSON.parse(readFileSync(f.output,'utf8'));
    assert.deepEqual(result,{migrations:[
      {version:'20261001202836',name:'bootstrap_example'},
      {version:'20261101181812',name:'v3_s13_adopt_rules_v4_1_roleplay_registry'}
    ]});
    assert.equal(statSync(f.output).mode & 0o777,0o600);
    assert.equal(JSON.parse(outcome.stdout).projectIdentityVerified,false);
    assert.match(JSON.parse(outcome.stdout).csvSha256,/^[a-f0-9]{64}$/);
    assert.equal(f.call().status,2,'refuse overwrite of existing evidence');
  } finally {f.cleanup();}
});

test('accepts indexed SQL Editor-view CSV, BOM and quoted names without changing names',()=>{
  const f=testCase('\uFEFFindex,version,name\n0,20261001202836,"bootstrap_hello,one"\n1,20261101181812,"quoted ""name"""\n');
  try { const s=f.call(); assert.equal(s.status,0,s.stderr); assert.equal(JSON.parse(readFileSync(f.output)).migrations[0].name,'bootstrap_hello,one');assert.equal(JSON.parse(readFileSync(f.output)).migrations[1].name,'quoted "name"'); } finally {f.cleanup();}
});

for (const [reason,input,flags] of [
  ['duplicate','version,name\n20261001202836,first\n20261001202836,second\n',[]],
  ['unsorted','version,name\n20261101181812,end\n20261001202836,start\n',[]],
  ['malformed version','version,name\n11,wrong\n',[]],
  ['empty name','version,name\n20261101181812,\n',[]],
  ['missing row','version,name\n',[]],
  ['invalid index','index,version,name\n7,20261101181812,foo\n',[]],
  ['extra columns','version,name\n20261101181812,foo,extra\n',[]],
  ['unclosed quote','version,name\n20261101181812,"foo\n',[]],
  ['wrong expected count',good,['--expected-count','497']],
  ['unknown header','row,version,name\n0,20261101181812,foo\n',[]],
]) test(`rejects ${reason} without creating output`,()=>{
  const f=testCase(input,flags);
  try {const s=f.call();assert.equal(s.status,2);assert.equal(existsSync(f.output),false);assert.match(s.stderr,/FAIL CLOSED/);} finally {f.cleanup();}
});
