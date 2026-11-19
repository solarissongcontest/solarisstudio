import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tables,columns,functions,indexes,triggers} from './v3-s13-s14-catalog-export.mjs';
const p='docs/v3/recovery-candidates/evidence/s13-s16-current-hosted-catalog-2026-11-19.json';
const e=JSON.parse(readFileSync(p,'utf8'));
assert.equal(e.project_id,'dkxmnvekiopyesuzggeu');
assert.match(e.source_sha,/^[a-f0-9]{40}$/);
assert.equal(e.migration_frontier.count,497);
assert.equal(e.migration_frontier.tip,'20261101181812');
assert.equal(e.migration_frontier.source_count,521);
assert.equal(e.migration_frontier.legacy_boundary,'20261014020000');
assert.deepEqual(e.migration_frontier.counts,{legacy:281,historical:36,after_tip:59});
assert.equal(e.migration_frontier.post_bootstrap_and_future.length,95);
assert.equal(new Set(e.migration_frontier.post_bootstrap_and_future.map(x=>x.version)).size,95);
for(const x of e.migration_frontier.post_bootstrap_and_future){assert.equal(x.deployable,false);assert.match(x.blob_sha,/^[a-f0-9]{40}$/);}
for(const [k,v] of Object.entries({tables,columns:columns.map(x=>x.relation+'/'+x.name),functions,indexes,triggers:triggers.map(x=>x.join('/'))})){
 const actual=e.catalog[k].map(x=>k==='columns'||k==='triggers'?x.relation+'/'+x.name:x.identity);
 assert.deepEqual([...actual].sort(),[...v].sort(),k+' scope drift');
}
assert.equal(e.catalog.tables.filter(x=>x.exists_now).length,4);
assert.equal(e.catalog.functions.filter(x=>x.exists_now).length,4);
assert.equal(e.catalog.indexes.filter(x=>x.exists_now).length,0);
assert.equal(e.catalog.triggers.filter(x=>x.exists_now).length,2);
assert.equal(e.catalog.columns.length,31);assert.ok(e.catalog.columns.every(x=>x.compatible&&x.exists_now));
assert.equal(e.downstream.tables.filter(x=>x.exists_now).length,5);
assert.equal(e.downstream.functions.filter(x=>x.exists_now).length,2);
assert.equal(e.changes_since_nov13.length,2);assert.equal(e.downstream_changed,false);
assert.equal(e.certification.real_backup_restore,false);assert.equal(e.certification.hosted_equivalence,false);
assert.equal(e.certification.production_migration_approval,false);
console.log(JSON.stringify({PASS:true,source:e.source_sha,sha256:createHash('sha256').update(readFileSync(p)).digest('hex'),legacy:281,historical:36,newer:59,production_mutation:false}));
