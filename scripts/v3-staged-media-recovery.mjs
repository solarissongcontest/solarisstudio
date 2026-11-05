#!/usr/bin/env node
/**
 * Manually authorized, one-off V3 legacy-media recovery.
 * Production Storage is never accessed by importing this module or by CI.
 */
import {readFile,appendFile,mkdir,chmod} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {parseStagedManifest,verifyStaging,restoreApprovedStaging} from './lib/v3-staged-media-recovery.mjs';
import {verifyRepositoryOwner,ownerSigningKey,currentRecoveryHead} from './lib/v3-owner-media-recovery.mjs';

function parameter(name) {
 const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;
}
async function run() {
 if(process.env.CI) throw Error('Production recovery disabled in CI');
 if(process.env.SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED!=='YES_READ_DESTINATION')
   throw Error('Missing explicit read-only inspection acknowledgment');
 const manifestPath=parameter('--manifest');
 if(!manifestPath)throw Error('Provide original checksums.json via --manifest');
 const files=parseStagedManifest(await readFile(resolve(manifestPath)));
 const credential=process.env.SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY;
 if(!credential)throw Error('Missing protected Storage credential');
 const {createClient}=await import('@supabase/supabase-js');
 const client=createClient('https://dkxmnvekiopyesuzggeu.supabase.co',credential,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{'X-Client-Info':'solaris-v3-manual-staging-recovery/1'}},
 });
 const platformMode=async()=>{
  const {data,error}=await client.from('studio2_platform_operational_state')
    .select('mode').eq('singleton',true).maybeSingle();
  if(error||!data||!['normal','degraded','read_only','maintenance'].includes(data.mode))
    throw Error('Unable to establish canonical platform mode');
  return data.mode;
 };
 const mode=await platformMode();
 if(mode==='maintenance')throw Error('Maintenance prohibits recovery');
 // All source objects must match the original ZIP checksums before considering any write.
 const verified=await verifyStaging(client,files);
 const count=verified.reduce((n,f)=>n+f.size,0);
 if(!process.argv.includes('--execute')) {
  console.log(JSON.stringify({mode:'read-only-inspection',platform_mode:mode,
   staged_verified:verified.length,verified_bytes:count,public_uploads:0},null,2));
  return;
 }
 if(process.env.SOLARIS_RECOVERY_PRODUCTION_WRITE_APPROVED!=='APPROVE_REAL_PRODUCTION_STORAGE_WRITE')
  throw Error('Explicit protected production write acknowledgment missing');
 const approvalPath=parameter('--approval-file');
 if(!approvalPath)throw Error('Signed approval file required for --execute');
 const approval=JSON.parse(await readFile(resolve(approvalPath),'utf8'));
 // The owner path is opt-in, never inferred from a name written into JSON.
 // Prove the same repository-owner identity again at execution time.
 let ownerProof=null;
 let signingKey=process.env.SOLARIS_RECOVERY_APPROVAL_HMAC_KEY;
 if(approval?.owner_authorization){
  if(process.env.SOLARIS_RECOVERY_OWNER_DECISION!=='I_APPROVE_RESTORATION_OF_PREVIOUSLY_PUBLIC_SOLARIS_IMAGES')
   throw Error('Missing explicit Solaris owner publication decision');
  if(approval.local_rehearsal_sha!==currentRecoveryHead())
   throw Error('Recovery code changed since owner approval');
  ownerProof=await verifyRepositoryOwner(
   process.env.SOLARIS_RECOVERY_GITHUB_OWNER_TOKEN||process.env.GITHUB_TOKEN
  );
  signingKey=await ownerSigningKey();
 }
 const stateDir=resolve(parameter('--state-dir')||
   join(homedir(),'.local/state/solaris-v3-staged-media-recovery'));
 if(!stateDir.startsWith(homedir()+'/'))throw Error('Checkpoint directory must be under operator home');
 await mkdir(stateDir,{recursive:true,mode:0o700});await chmod(stateDir,0o700);
 const checkpoint=join(stateDir,'checkpoints.jsonl');
 const result=await restoreApprovedStaging({
  client,files,approval,
  signingKey,ownerProof,
  manualAck:process.env.SOLARIS_RECOVERY_PRODUCTION_WRITE_APPROVED,
  readOnlyAck:process.env.SOLARIS_RECOVERY_READ_ONLY_EXCEPTION_APPROVED,
  readMode:platformMode,
  checkpoint:async row=>appendFile(checkpoint,JSON.stringify(row)+'\n',{mode:0o600}),
 });
 console.log(JSON.stringify({mode:'approved-storage-only',...result},null,2));
}
run().catch(e=>{
 // Never echo provider exception bodies, object URLs, or tokens to output.
 const allow=new Set([
  'Production recovery disabled in CI',
  'Missing explicit read-only inspection acknowledgment',
  'Provide original checksums.json via --manifest',
  'Missing protected Storage credential',
  'Unable to establish canonical platform mode',
  'Maintenance prohibits recovery',
  'Explicit protected production write acknowledgment missing',
  'Signed approval file required for --execute',
  'Checkpoint directory must be under operator home',
  'Missing explicit Solaris owner publication decision',
  'Recovery code changed since owner approval',
  'A protected GitHub owner token is required',
  'GitHub owner authentication unavailable',
  'Authenticated GitHub identity is not the Solaris repository owner',
  'Owner approval signing key missing',
  'Unsafe owner signing key permissions',
 ]);
 console.error(allow.has(String(e.message))?e.message:'Recovery stopped: inspection or authorization failed');
 process.exitCode=1;
});
