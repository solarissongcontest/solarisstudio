import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sha256,stableJson} from './v3-media-recovery-core.mjs';
import {verifyRepositoryOwner,assertOwnerAuthorization,OWNER_METHOD} from './v3-owner-media-recovery.mjs';
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

function signedOwnerApproval(){
 const base=signedApproval();
 const {signature:discard,...u}=base;
 u.operator='solarissongcontest';
 u.owner_authorization={
  method:OWNER_METHOD,github_login:'solarissongcontest',
  repository:'solarissongcontest/solarisstudio',
  decision:'APPROVE_VERIFIED_LEGACY_PUBLIC_IMAGES_ONLY',
  approved_at:'2026-11-04T18:30:00Z'
 };
 u.read_only_recovery_exception={
  scope:'historical-public-media-only',
  destination_project:'dkxmnvekiopyesuzggeu',
  keeps_confirmation_and_general_mutations_locked:true,
  approval_method:OWNER_METHOD,owner_github_login:'solarissongcontest',
  change_ticket:u.change_ticket,reason:'Restore verified previously public images only'
 };
 return {...u,signature:createHmac('sha256',signingKey).update(stableJson(u)).digest('hex')};
}
const ownerProof={
 github_login:'solarissongcontest',repository:'solarissongcontest/solarisstudio',
 repository_admin:true,verified_at:'2026-11-04T18:55:00Z'
};
test('authenticated repository owner replaces independent reviewer only for explicitly signed owner mode',async()=>{
 const f=new Fake();
 const approval=signedOwnerApproval();
 assert.doesNotThrow(()=>assertOwnerAuthorization(approval,ownerProof,now));
 assert.doesNotThrow(()=>assertScopedMode('read_only',approval,'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',ownerProof,now));
 const result=await restoreApprovedStaging(request(f,{approval,ownerProof}));
 assert.equal(result.copied,1);
 assert.equal(f.uploads,1);
});
test('solo-owner path rejects missing and impersonated identity, even outside read-only',async()=>{
 const approval=signedOwnerApproval();
 for(const proof of [null,{...ownerProof,github_login:'impostor'},
   {...ownerProof,repository_admin:false},{...ownerProof,repository:'other/repo'},
   {...ownerProof,verified_at:'2026-11-04T18:00:00Z'}]){
  assert.throws(()=>assertScopedMode('read_only',approval,'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',proof,now),/owner|expired/);
  assert.throws(()=>assertScopedMode('normal',approval,'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',proof,now),/owner|expired/);
  const f=new Fake();
  await assert.rejects(restoreApprovedStaging(request(f,{approval,ownerProof:proof})),/owner|expired/);
  assert.equal(f.uploads,0);
 }
});
test('solo-owner authorization is signed and expires; never permits maintenance or mixed-mode claims',async()=>{
 const approval=signedOwnerApproval();
 const tampered=structuredClone(approval);
 tampered.owner_authorization.github_login='attacker';
 const f=new Fake();
 await assert.rejects(restoreApprovedStaging(request(f,{approval:tampered,ownerProof})),/signature/);
 assert.equal(f.uploads,0);
 const expired=structuredClone(approval);
 expired.owner_authorization.approved_at='2026-10-01T10:00:00Z';
 assert.throws(()=>assertScopedMode('read_only',expired,'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',ownerProof,now),/expired/);
 const mixed=structuredClone(approval);
 mixed.read_only_recovery_exception.independent_reviewer='imaginary';
 assert.throws(()=>assertScopedMode('read_only',mixed,'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',ownerProof,now),/mode/);
 assert.throws(()=>assertScopedMode('maintenance',approval,'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',ownerProof,now),/mode/);
});
test('GitHub owner proof checks authenticated owner and admin rights without network in local tests',async()=>{
 const calls=[];
 const fakeFetch=async url=>{
  calls.push(url);
  return {ok:true,json:async()=>url.endsWith('/user')
   ?{login:'solarissongcontest'}
   :{full_name:'solarissongcontest/solarisstudio',owner:{login:'solarissongcontest'},permissions:{admin:true}}};
 };
 const proof=await verifyRepositoryOwner('test-protected-token',fakeFetch);
 assert.equal(proof.github_login,'solarissongcontest');
 assert.equal(proof.repository_admin,true);
 assert.equal(calls.length,2);
 await assert.rejects(verifyRepositoryOwner('test-protected-token',async url=>({
  ok:true,json:async()=>url.endsWith('/user')?{login:'someone-else'}:
  {full_name:'solarissongcontest/solarisstudio',owner:{login:'solarissongcontest'},permissions:{admin:false}}
 })),/not the Solaris repository owner/);
 await assert.rejects(verifyRepositoryOwner('',fakeFetch),/token/);
});
