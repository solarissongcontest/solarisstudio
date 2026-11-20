import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditClaims, expectedPaths, fetchIssueComments, normalizeComments } from './check-world-swarm-claims.mjs';

function claim(id, created, session, files) {
  return { id, created_at: created, body: `TASK CLAIM\nSession ID: ${session}\nFiles/directories expected to change: ${files}\nTables/RPCs/interfaces expected to change: NONE\nBranch name: example` };
}
const a='WORLD-AUTO-aaaa', b='WORLD-AUTO-bbbb';
const one=claim(6690000001,'2026-11-07T00:00:00Z',a,'`public/sw.js`; NEW `src/lib/sw.test.ts`');
const two=claim(6690000002,'2026-11-07T00:00:01Z',b,'public/sw.js; src/lib/other.test.ts');

describe('canonical issue #2233 pre-PR claim ownership preflight',()=>{
  it('finds the earliest overlapping source claim, not unrelated files or PR numbers',()=>{
    const r=auditClaims([two,one]);
    assert.equal(r.collisions.length,1);
    assert.deepEqual([r.collisions[0].earlierClaim,r.collisions[0].laterClaim],[one.id,two.id]);
    assert.equal(r.collisions[0].earlierPath,'public/sw.js');
    assert.deepEqual(r.unscopedClaims,[]);
  });
  it('honors an explicit same-session released claim and does not release rival sessions',()=>{
    const release={id:6690000003,created_at:'2026-11-07T00:00:02Z',body:`CLAIM RELEASED / CONFLICT\nSession ID: ${b}\nEarlier task claim comment #${two.id} RELEASED before edits; earlier rival claim #${one.id} retains ownership.`};
    const r=auditClaims([one,two,release]);
    assert.equal(r.collisions.length,0);
    assert.equal(r.releasedClaims,1);
    assert.equal(r.ambiguousReleases.length,0);
  });
  it('never accepts an unreferenced release as a proven claim transfer',()=>{
    const release={id:6690000003,created_at:'2026-11-07T00:00:02Z',body:`CLAIM RELEASED\nSession ID: ${b}\nI am moving on.`};
    const r=auditClaims([one,two,release]);
    assert.equal(r.collisions.length,1);
    assert.equal(r.ambiguousReleases.length,1);
  });
  it('recognizes wildcard and directory overlap conservatively',()=>{
    const r=auditClaims([claim(6690000001,'2026-11-07T00:00:00Z',a,'`src/lib/world-*.ts`; `docs/v3/`'),claim(6690000002,'2026-11-07T00:00:01Z',b,'`src/lib/world-routes.ts`; `docs/v3/world.md`')]);
    assert.equal(r.collisions.length,2);
  });
  it('requires concrete scope and rejects fabricated timestamps or duplicate IDs',()=>{
    const bare=claim(6690000001,'2026-11-07T00:00:00Z',a,'none');
    assert.deepEqual(auditClaims([bare]).unscopedClaims,[{commentId:bare.id,sessionId:a}]);
    assert.throws(()=>normalizeComments([{...bare,created_at:'unknown'}]),/Incomplete/);
    assert.throws(()=>normalizeComments([bare,bare]),/Duplicate comment/);
  });
  it('reads only the explicit files section, excluding incidental dependency references',()=>{
    const text=`TASK CLAIM\nSession ID: ${a}\nDependencies: public/sw.js\nFiles/directories expected to change:\n- NEW \`scripts/example.mjs\`\n- NEW src/lib/new-world.test.ts\nExisting PRs involved: public/sw.js`;
    assert.deepEqual(expectedPaths(text),['scripts/example.mjs','src/lib/new-world.test.ts']);
  });
  it('reads all GitHub pages and fails closed on read errors',async()=>{
    const calls=[];
    const page=Array.from({length:100},(_,i)=>claim(6690000000+i,'2026-11-07T00:00:00Z',a,`scripts/tool-${i}.mjs`));
    const result=await fetchIssueComments({token:'',fetchImpl:async(url)=>{calls.push(url);return {ok:true,json:async()=>calls.length===1?page:[]};}});
    assert.equal(result.length,100);
    assert.equal(calls.length,2);
    await assert.rejects(()=>fetchIssueComments({token:'',fetchImpl:async()=>({ok:false,status:403})}),/GitHub read failed/);
  });
});
