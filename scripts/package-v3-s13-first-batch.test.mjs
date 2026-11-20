import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderBatch,inputs,reconcileEffects} from './package-v3-s13-first-batch.mjs';
test('S13 batch reuses immutable core, one transaction and no official/global writers',()=>{
 const batch=renderBatch(),core=fs.readFileSync(inputs[0],'utf8');
 assert.deepEqual(Object.keys(batch),['preflight.sql','install.sql','postcheck.sql']);
 const canonical=core.slice(core.indexOf('\nbegin;')+1).replace(/^begin;\n/,'').replace(/\ncommit;\s*$/,'');
 assert.ok(batch['install.sql'].includes(canonical),'Original complete implementation must remain exact');
 assert.equal((batch['install.sql'].match(/^begin;$/gm)||[]).length,1);
 assert.equal((batch['install.sql'].match(/^commit;$/gm)||[]).length,1);
 assert.ok(batch['install.sql'].lastIndexOf('revoke all on function')>batch['install.sql'].lastIndexOf('grant execute on function public.v3_register_migration_contract'));
 assert.doesNotMatch(batch['install.sql'],/alter default privileges|insert into supabase_migrations|update public\.|delete from public\.|drop\s+(table|function|trigger)|create\s+extension/i);
 assert.match(batch['install.sql'],/has_sequence_privilege/);
 assert.match(batch['install.sql'],/has_any_column_privilege/);
 assert.match(batch['install.sql'],/'TRUNCATE'/);
 assert.match(batch['install.sql'],/pg_event_trigger/);
 assert.match(batch['install.sql'],/pgrst_ddl_watch/);
 assert.match(batch['install.sql'],/afaad7193dcf8f81e728d2bedb85e43e/);
 assert.match(batch['install.sql'],/pg_try_advisory_xact_lock/);
 assert.match(batch['preflight.sql'],/begin transaction read only/);
 assert.match(batch['postcheck.sql'],/begin transaction read only/);
});

test('fourteen missing S13 effects are reconciled offline, history is preserved',()=>{const x=reconcileEffects();assert.equal(x.effects.length,14);assert.ok(x.effects.every(e=>e.observed==='absent'&&e.action==='create'));assert.equal(x.history.historyWrites,0);assert.equal(x.externalDependency.action,'preserve');assert.equal(x.qualifiedDdlHandler.identity,'extensions.pgrst_ddl_watch()');assert.equal(x.qualifiedDdlHandler.definitionMd5,'afaad7193dcf8f81e728d2bedb85e43e');});

test('one operator procedure invokes the private restore and clone-only hook safely',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const file of ['scripts/ops/solaris-s13-first-batch-operator.sh','scripts/ops/solaris-role-acl-rehearsal-20261120.sh']){
  const result=spawnSync('bash',['-n',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 }
 const wrapper=fs.readFileSync('scripts/ops/solaris-s13-first-batch-operator.sh','utf8');
 const restore=fs.readFileSync('scripts/ops/solaris-role-acl-rehearsal-20261120.sh','utf8');
 assert.match(wrapper,/SOLARIS_REVIEWED_SOURCE_SHA/);
 assert.match(wrapper,/\$\{PIPESTATUS\[0\]\}/);
 assert.match(wrapper,/restore_rc.*== 2/);
 assert.match(wrapper,/operatorBoundPrivateArchiveRehearsalPassed/);
 assert.match(restore,/--check-package "\$S13_BATCH_PACKAGE"/);
 assert.match(restore,/--baseline-kind recovered-private/);
 assert.match(restore,/S13-only scope: independent completed Storage verification not repeated/);
 assert.ok(restore.indexOf('--check-package')<restore.indexOf("echo '[1/4]"));
 assert.ok(restore.indexOf('S13_BATCH_PROOF:')<restore.indexOf('# Retain object-level catalog evidence'));
 assert.doesNotMatch(wrapper,/supabase (db push|migration repair)|wrangler|https?:\/\//);
});
