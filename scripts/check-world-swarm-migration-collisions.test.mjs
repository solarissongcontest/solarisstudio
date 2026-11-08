import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditWorldMigrationSnapshot, validMigrationClock } from './check-world-swarm-migration-collisions.mjs';
const sha='a'.repeat(40), head='b'.repeat(40);
const migration=name=>'supabase/migrations/'+name;
const base=()=>({repository:'solarissongcontest/solarisstudio',mainSha:sha,mainFiles:[migration('20261107001000_a.sql'), migration('20260812006000_legacy.sql')],pullRequests:[]});
const add=name=>({filename:migration(name),status:'added'});
const pr=(number,files)=>({number,headSha:head,files});

test('strict new clock parsing includes leap-day and second bounds',()=>{
  for (const s of ['20261107005500','20240229235959']) assert.equal(validMigrationClock(s),true);
  for (const s of ['20261107006000','20261104126000','20260229000000','20261301000000','20261107000060']) assert.equal(validMigrationClock(s),false);
});
test('grandfathers old synthetic main clocks and detects cross PR version collision',()=>{
  const s=base();
  assert.equal(auditWorldMigrationSnapshot(s).clean,true);
  s.pullRequests=[pr(2271,[add('20261107005500_union.sql')]),pr(2288,[add('20261107005500_court.sql')])];
  const report=auditWorldMigrationSnapshot(s);
  assert.equal(report.clean,false);
  assert.deepEqual(report.issues.find(x=>x.code==='cross_pr_version_collision').prs,[2271,2288]);
});
test('detects version and pathname conflicts independently',()=>{
  const s=base(); s.pullRequests=[pr(1,[add('20261107110000_x.sql')]),pr(2,[add('20261107110000_x.sql')])];
  const codes=auditWorldMigrationSnapshot(s).issues.map(x=>x.code);
  assert.ok(codes.includes('cross_pr_version_collision'));
  assert.ok(codes.includes('cross_pr_path_overlap'));
});
test('detects invalid new clocks, reused main versions and forward-only main edits',()=>{
  const s=base(); s.pullRequests=[pr(1,[add('20261107006000_invalid.sql'),add('20261107001000_other.sql'),{filename:migration('20261107001000_a.sql'),status:'modified'}])];
  const codes=auditWorldMigrationSnapshot(s).issues.map(x=>x.code);
  for (const c of ['invalid_new_calendar','version_already_on_main','main_migration_edited']) assert.ok(codes.includes(c));
});
test('candidate readiness ignores unrelated backlog collisions but requires candidate inclusion',()=>{
  const s=base(); s.pullRequests=[pr(1,[add('20261107110000_x.sql')]),pr(2,[add('20261107110000_y.sql')]),pr(3,[add('20261107110100_z.sql')])];
  assert.equal(auditWorldMigrationSnapshot(s,3).clean,true);
  assert.equal(auditWorldMigrationSnapshot(s,1).clean,false);
  assert.throws(()=>auditWorldMigrationSnapshot(s,4),/absent/);
});
test('rejects incomplete and malformed metadata instead of guessing',()=>{
  assert.throws(()=>auditWorldMigrationSnapshot({...base(), mainSha:'unknown'}),/SHA/);
  const s=base(); s.pullRequests=[pr(1,[]),pr(1,[])];
  assert.throws(()=>auditWorldMigrationSnapshot(s),/duplicate/);
});
test('offline CLI has success, finding, error exit codes without any network',()=>{
  const dir=mkdtempSync(join(tmpdir(),'v3-world-')),f=join(dir,'snap.json');
  const executable=new URL('./check-world-swarm-migration-collisions.mjs',import.meta.url).pathname;
  const run=()=>spawnSync(process.execPath,[executable,'--snapshot',f],{encoding:'utf8',env:{PATH:process.env.PATH}});
  try {
    writeFileSync(f,JSON.stringify(base())); assert.equal(run().status,0);
    const s=base();s.pullRequests=[pr(1,[add('20261107006000_broken.sql')])];
    writeFileSync(f,JSON.stringify(s));const bad=run();assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stdout).clean,false);
    rmSync(f);assert.equal(run().status,2);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('live collector rechecks PR and main SHAs and never talks to Supabase', async () => {
  const { collectWorldMigrationSnapshot } = await import('./check-world-swarm-migration-collisions.mjs');
  const originalFetch=globalThis.fetch;
  const calls=[];
  const fixture=(changeMain=false,changePr=false,inventoryChange='')=>{
    let mainReads=0, pullReads=0;
    return async (url) => {
    const path=new URL(url).pathname;
    calls.push(path);
    let body;
    if (path.endsWith('/branches/main')) body={commit:{sha:changeMain && ++mainReads>1?'c'.repeat(40):sha}};
    else if (path.endsWith('/contents/supabase/migrations')) body=[{type:'file',name:'20261107001000_a.sql',path:migration('20261107001000_a.sql')}];
    else if (path.endsWith('/pulls')) {
      pullReads++;
      const row={number:5,title:'[V3-WORLD] TG14',head:{sha:head,ref:'v3/world/tg14'}};
      body=pullReads===1 || !inventoryChange ? [row] :
        inventoryChange==='added' ? [row,{number:6,title:'[V3-WORLD] New TG15',head:{sha:'d'.repeat(40),ref:'v3/world/tg15'}}] :
        inventoryChange==='closed' ? [] :
        inventoryChange==='retitled' ? [{...row,title:'[V3-WORLD] TG15'}] : [row];
    }
    else if (path.endsWith('/pulls/5/files')) body=[{filename:migration('20261107005000_court.sql'),status:'added'}];
    else if (path.endsWith('/pulls/5')) body={state:'open',head:{sha:changePr?'c'.repeat(40):head}};
    else throw Error('unexpected route '+path);
    return {ok:true,json:async()=>body};
    };
  };
  try {
    globalThis.fetch=fixture();
    const result=await collectWorldMigrationSnapshot('solarissongcontest/solarisstudio','mock-token',true);
    assert.equal(result.mainSha,sha);
    assert.equal(result.pullRequests[0].files[0].status,'added');
    assert.equal(calls.filter(x=>x.endsWith('/branches/main')).length,2);
    assert.equal(calls.filter(x=>x.endsWith('/pulls')).length,2);
    assert.ok(calls.every(x=>x.startsWith('/repos/')));
    globalThis.fetch=fixture(true);
    await assert.rejects(collectWorldMigrationSnapshot('solarissongcontest/solarisstudio','mock-token'),/Main advanced/);
    globalThis.fetch=fixture(false,true);
    await assert.rejects(collectWorldMigrationSnapshot('solarissongcontest/solarisstudio','mock-token'),/PR changed/);
    for (const change of ['added','closed','retitled']) {
      globalThis.fetch=fixture(false,false,change);
      await assert.rejects(collectWorldMigrationSnapshot('solarissongcontest/solarisstudio','mock-token'),/Open PR inventory changed/);
    }
  } finally { globalThis.fetch=originalFetch; }
});
