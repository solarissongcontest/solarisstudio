import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sha256,stableJson} from './v3-media-recovery-core.mjs';
import {stagedDigest,assertScopedMode,verifyStaging,restoreApprovedStaging}
 from './v3-staged-media-recovery.mjs';

const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
const owner='34078189-5be2-4370-8dfd-c9d4b498a6a6';
const file={bucket:'country-media',path:owner+'/gallery/a.png',stagedPath:'country-media/'+owner+'/gallery/a.png',
 owner,size:bytes.length,mime:'image/png',sha256:sha256(bytes)};
const id=file.bucket+'/'+file.path+'#'+file.sha256;
const signingKey='independent-review-key-at-least-32-bytes-long';
const now=new Date('2026-11-04T19:00:00Z');
function signedApproval(){
 const u={source_project:'oxtbskojiexkaspputvo',destination_project:'dkxmnvekiopyesuzggeu',
 scope:'storage-only-non-overwrite',manifest_sha256:stagedDigest([file]),
 operator:'operator-1',change_ticket:'RECOVERY-TEST',local_rehearsal_sha:'test',
 expires_at:'2026-11-06T00:00:00Z',reviewed_assets:[id],
 asset_clearances:[{identity:id,visibility:'already_published',canonical_subject_id:owner,
 publication_evidence_id:'published-verified',validation_evidence_id:'validated-verified'}],
 read_only_recovery_exception:{scope:'historical-public-media-only',
 destination_project:'dkxmnvekiopyesuzggeu',keeps_confirmation_and_general_mutations_locked:true,
 independent_reviewer:'reviewer-2',change_ticket:'RECOVERY-TEST',reason:'Previously approved public image'}};
 return {...u,signature:createHmac('sha256',signingKey).update(stableJson(u)).digest('hex')};
}
class Fake {
 constructor(){this.data=new Map([['solaris-upload-quarantine/'+file.stagedPath,bytes]]);this.uploads=0;this.stagingPublic=false;}
 storage={
  listBuckets:async()=>({data:[{id:'solaris-upload-quarantine',public:this.stagingPublic},
   {id:'country-media',public:true},{id:'edition-artwork',public:true}],error:null}),
  from:bucket=>({
   download:async path=>{const data=this.data.get(bucket+'/'+path);
    return data?{data:{arrayBuffer:async()=>data},error:null}:{data:null,error:{status:404}};},
   upload:async(path,body,opts)=>{
    assert.equal(opts.upsert,false);this.uploads++;
    if(this.data.has(bucket+'/'+path))return {error:{status:409}};
    this.data.set(bucket+'/'+path,Buffer.from(body));return {error:null};
   },
  }),
 };
}
const request=(client,override={})=>({client,files:[file],approval:signedApproval(),
 signingKey,manualAck:'APPROVE_REAL_PRODUCTION_STORAGE_WRITE',
 readOnlyAck:'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',readMode:async()=> 'read_only',
 ci:false,clock:()=>now,...override});
test('normal mode allowed, read-only requires scoped independent review, maintenance denied',()=>{
 assert.doesNotThrow(()=>assertScopedMode('normal',null,null));
 assert.doesNotThrow(()=>assertScopedMode('read_only',signedApproval(),'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY'));
 assert.throws(()=>assertScopedMode('read_only',null,null),/mode/);
 assert.throws(()=>assertScopedMode('maintenance',signedApproval(),'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY'),/mode/);
});
test('verifies private quarantine SHA-256 and original size',async()=>{
 const f=new Fake();assert.equal((await verifyStaging(f,[file])).length,1);
 f.data.set('solaris-upload-quarantine/'+file.stagedPath,Buffer.from('bad'));
 await assert.rejects(verifyStaging(f,[file]),/integrity/);
});
test('approved recovery uploads exact bytes without deleting staging',async()=>{
 const f=new Fake();const r=await restoreApprovedStaging(request(f));
 assert.equal(r.copied,1);assert.equal(f.uploads,1);
 assert.ok(f.data.get('solaris-upload-quarantine/'+file.stagedPath).equals(bytes));
});
test('repeat recovery is idempotent',async()=>{
 const f=new Fake();await restoreApprovedStaging(request(f));
 const second=await restoreApprovedStaging(request(f));
 assert.equal(second.already_identical,1);assert.equal(f.uploads,1);
});
test('target byte collision fails without any writes',async()=>{
 const f=new Fake();f.data.set(file.bucket+'/'+file.path,Buffer.from('collision'));
 await assert.rejects(restoreApprovedStaging(request(f)),/collision/);
 assert.equal(f.uploads,0);
});
test('tampered approval cannot publish',async()=>{
 const f=new Fake(),r=request(f);r.approval.asset_clearances[0].validation_evidence_id='forged';
 await assert.rejects(restoreApprovedStaging(r),/signature/);
 assert.equal(f.uploads,0);
});
test('maintenance transition and read-only scope mismatch fail closed',async()=>{
 const f=new Fake();let reads=0;
 await assert.rejects(restoreApprovedStaging(request(f,{readMode:async()=>++reads===1?'read_only':'maintenance'})),/mode/);
 assert.equal(f.uploads,0);
 await assert.rejects(restoreApprovedStaging(request(f,{readOnlyAck:null})),/mode/);
});
test('privacy mismatch and CI production guard deny all writes',async()=>{
 const f=new Fake();f.stagingPublic=true;
 await assert.rejects(restoreApprovedStaging(request(f)),/privacy/);
 assert.equal(f.uploads,0);
 await assert.rejects(restoreApprovedStaging(request(new Fake(),{ci:true})),/CI/);
});
