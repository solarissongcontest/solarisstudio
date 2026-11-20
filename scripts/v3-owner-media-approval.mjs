#!/usr/bin/env node
/**
 * Manual owner approval for a one-time recovery of previously public Solaris
 * media. Preparation has no secrets or network calls. Signing requires live,
 * authenticated GitHub repository-owner proof and locally passing fake tests.
 * Never used by hosted CI or browser audits.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertApprovedWrite,assertAssetClearance,stableJson} from './lib/v3-media-recovery-core.mjs';
import {parseStagedManifest,stagedDigest,assertScopedMode,legacyOwnerEvidence,assertLegacyOwnerClearance} from './lib/v3-staged-media-recovery.mjs';
import {OWNER_LOGIN,OWNER_METHOD,OWNER_REPOSITORY,verifyRepositoryOwner,
 ownerSigningKey,currentRecoveryHead} from './lib/v3-owner-media-recovery.mjs';

const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const identity=f=>f.bucket+'/'+f.path+'#'+f.sha256;
const defaultDraft=join(homedir(),'media-approval-OWNER-DRAFT.json');
const defaultSigned=join(homedir(),'approved-media-recovery.json');
function confirmNoHostedCI(){if(process.env.CI)throw Error('Owner approval is forbidden in CI');}
async function run(){
 confirmNoHostedCI();
 const manifest=arg('--manifest');
 if(!manifest)throw Error('Provide --manifest ./checksums.json');
 const files=parseStagedManifest(await readFile(resolve(manifest)));
 const eligible=files.filter(f=>f.size<=5242880);
 if(process.argv.includes('--prepare')){
  const ticket='OWNER-LEGACY-MEDIA-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
  const draft={
   source_project:'oxtbskojiexkaspputvo',
   destination_project:'dkxmnvekiopyesuzggeu',
   scope:'storage-only-non-overwrite',
   manifest_sha256:stagedDigest(files),
   operator:OWNER_LOGIN,
   change_ticket:ticket,
   local_rehearsal_sha:null,
   expires_at:null,
   reviewed_assets:eligible.map(identity),
   asset_clearances:eligible.map(f=>({
    identity:identity(f),visibility:'already_published',canonical_subject_id:f.owner,
    ...legacyOwnerEvidence(f)
   })),
   owner_authorization:{
    method:OWNER_METHOD,github_login:OWNER_LOGIN,repository:OWNER_REPOSITORY,
    decision:'APPROVE_VERIFIED_LEGACY_PUBLIC_IMAGES_ONLY',approved_at:null
   },
   read_only_recovery_exception:{
    scope:'historical-public-media-only',
    destination_project:'dkxmnvekiopyesuzggeu',
    keeps_confirmation_and_general_mutations_locked:true,
    approval_method:OWNER_METHOD,owner_github_login:OWNER_LOGIN,
    change_ticket:ticket,
    reason:'Restore individually validated and previously public Solaris media without reopening general mutations or Confirmation writes'
   }
  };
  const output=resolve(arg('--output')||defaultDraft);
  await writeFile(output,JSON.stringify(draft,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({status:'unsigned-owner-draft',draft:output,
   eligible:eligible.length,oversized_excluded:files.length-eligible.length,
   note:'Exact source public URLs and verified-quarantine SHA-256 evidence are prefilled. Review and approve only files that were previously public.'},null,2));
  return;
 }
 if(!process.argv.includes('--sign'))throw Error('Use --prepare or --sign');
 if(process.env.SOLARIS_RECOVERY_OWNER_DECISION!=='I_APPROVE_RESTORATION_OF_PREVIOUSLY_PUBLIC_SOLARIS_IMAGES')
  throw Error('Missing explicit Solaris owner publication decision');
 const filepath=resolve(arg('--draft')||defaultDraft);
 const approval=JSON.parse(await readFile(filepath,'utf8'));
 const byId=new Map(eligible.map(f=>[identity(f),f]));
 if(!Array.isArray(approval.reviewed_assets)||approval.reviewed_assets.length<1||
    new Set(approval.reviewed_assets).size!==approval.reviewed_assets.length||
    approval.asset_clearances?.length!==approval.reviewed_assets.length)
    throw Error('Missing or duplicate reviewed asset clearances');
 for(const id of approval.reviewed_assets){
  const f=byId.get(id);
  if(!f)throw Error('Approval includes an ineligible or changed asset');
  assertAssetClearance({bucket:f.bucket,path:f.path,source_sha256:f.sha256,
   source_bytes:f.size,source_mime:f.mime,private:false},approval);
  const c=approval.asset_clearances.find(x=>x?.identity===id);
  if(c?.canonical_subject_id!==f.owner)throw Error('Asset owner evidence mismatch');
  assertLegacyOwnerClearance(f,c);
 }
 if(approval.manifest_sha256!==stagedDigest(files))throw Error('Original media inventory does not match draft');
 // Pure, disposable fake-Storage local rehearsal only. Never contact production.
 execFileSync(process.execPath,['--test',
  'scripts/lib/v3-media-recovery-core.test.mjs',
  'scripts/lib/v3-staged-media-recovery.test.mjs'],{
   cwd:process.cwd(),timeout:30000,stdio:'pipe',
   env:{CI:'true',NODE_ENV:'test',PATH:process.env.PATH}
  });
 const proof=await verifyRepositoryOwner(
  process.env.SOLARIS_RECOVERY_GITHUB_OWNER_TOKEN||process.env.GITHUB_TOKEN
 );
 const now=new Date();
 approval.local_rehearsal_sha=currentRecoveryHead();
 approval.owner_authorization.approved_at=now.toISOString();
 approval.expires_at=new Date(now.getTime()+2*60*60*1000).toISOString();
 assertScopedMode('read_only',approval,'APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY',proof,now);
 const signingKey=await ownerSigningKey({create:true});
 const {signature:ignored,...unsigned}=approval;
 approval.signature=createHmac('sha256',signingKey).update(stableJson(unsigned)).digest('hex');
 assertApprovedWrite({approval,key:signingKey,digest:stagedDigest(files),ci:false,
  manualAck:'APPROVE_REAL_PRODUCTION_STORAGE_WRITE',now});
 const output=resolve(arg('--output')||defaultSigned);
 await writeFile(output,JSON.stringify(approval,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({status:'signed-solo-owner-recovery-approval',
  approved_count:approval.reviewed_assets.length,operator:proof.github_login,
  source_commit:approval.local_rehearsal_sha,expires_at:approval.expires_at,
  saved_to:output,production_uploads:0},null,2));
}
run().catch(err=>{
 const permitted=[
  'Owner approval is forbidden in CI','Provide --manifest ./checksums.json',
  'Missing explicit Solaris owner publication decision',
  'Missing or duplicate reviewed asset clearances','Approval includes an ineligible or changed asset',
  'Asset owner evidence mismatch','Original media inventory does not match draft',
  'Owner recovery legacy-public provenance or validation evidence mismatch',
  'Missing or duplicate per-asset clearance',
  'Public restore requires existing canonical publication and media validation evidence',
  'A protected GitHub owner token is required','GitHub owner authentication unavailable',
  'Authenticated GitHub identity is not the Solaris repository owner',
  'Verified Solaris owner authorization missing','Solaris owner approval or identity verification expired',
  'Platform mode blocks unapproved media publication'
 ];
 const m=String(err?.message||'');
 console.error(permitted.includes(m)?m:'Owner approval stopped: review, local rehearsal, or authorization failed (no upload)');
 process.exitCode=1;
});
