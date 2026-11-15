import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{execFileSync}from'node:child_process';
const script='scripts/stage-v3-media-prerequisites-local.mjs';
test('Media donor refuses nonlocal invocation before producing SQL',()=>{
 assert.throws(()=>execFileSync('node',[script],{env:{...process.env,SOLARIS_S02_TARGET:'production'},stdio:'pipe'}),/Media fixture refuses non-local execution/);
});
test('Media fixture qualifies all five source bodies and labels Storage as selected metadata',()=>{
 const sql=execFileSync('node',[script],{env:{...process.env,SOLARIS_S02_TARGET:'local'},encoding:'utf8'});
 assert.equal((sql.match(/Source\/observed Media helper definition mismatch/g)||[]).length,5);
 assert.ok(sql.includes('studio2_prepare_upload'));assert.ok(sql.includes('studio2_create_evidence_upload_authorization'));
 const metadata=execFileSync('node',[script,'--bootstrap'],{env:{...process.env,SOLARIS_S02_TARGET:'local'},encoding:'utf8'});
 assert.ok(metadata.includes('Provider triggers, complete object layout and real file bytes are NOT modeled'));
 assert.ok(metadata.includes('owner to supabase_storage_admin'));assert.ok(metadata.includes('enable row level security'));
});
test('Media adoption and owner-only Storage cutover remain distinct and sequenced',()=>{
 const migration=fs.readFileSync('supabase/migrations/20261115204228_v3_media_finalization_authority.sql','utf8');
 assert.equal((migration.match(/^begin;$/gm)||[]).length,1);assert.equal((migration.match(/^commit;$/gm)||[]).length,1);
 assert.ok(migration.includes('has_any_column_privilege'));assert.ok(migration.includes('for key share'));assert.ok(migration.includes('prepared Media update was suppressed'));
 assert.ok(!migration.includes('drop policy'));
 const owner=fs.readFileSync('docs/v3/recovery-candidates/media-storage-policy-owner-cutover.sql','utf8');
 assert.ok(owner.includes("current_user<>'supabase_storage_admin'"));assert.equal((owner.match(/^drop policy /gm)||[]).length,3);assert.ok(owner.includes('other_policy_digest'));
 const driver=fs.readFileSync('.github/scripts/v3-observed-owner-recovery-local.sh','utf8');assert.ok(driver.includes('source .github/scripts/v3-media-recovery-local.sh'));assert.ok(driver.includes('mediaStorageServiceVerified:false'));
});
