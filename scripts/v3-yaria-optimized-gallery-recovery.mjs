#!/usr/bin/env node
/** Yaria oversized legacy gallery image owner-operated scoped derivative restoration.
 * --inspect is entirely offline.
 * --execute verifies original in private quarantine and uploads a separately pinned
 * under-5MiB public derivative only after an explicit owner storage decision.
 * SQL reference addition is generated locally for protected manual execution.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {createClient} from '@supabase/supabase-js';
import {parseStagedManifest} from './lib/v3-staged-media-recovery.mjs';
import {verifyRepositoryOwner,currentRecoveryHead} from './lib/v3-owner-media-recovery.mjs';
import {YARIA,validateYariaManifest,validateYariaMedia,renderYariaGalleryReferenceSql} from './lib/v3-yaria-gallery-derivative.mjs';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const root='https://dkxmnvekiopyesuzggeu.supabase.co';
const allowed=[
 'Yaria derivative restoration forbidden in CI','Provide original --manifest and reviewed --candidate JPEG',
 'Unknown Yaria recovery action','Storage publishing requires explicit owner approval',
 'Protected destination read acknowledgement missing','Protected destination credential missing',
 'Destination platform is not read_only','Storage bucket privacy check failed',
 'Yaria canonical country row changed','Yaria gallery has already been restored',
 'Private original Yaria photo is missing','Stored public candidate differs from owner reviewed JPEG',
 'Published optimized JPEG did not pass readback','Protected SQL may be written only in operator home',
 'Original private Yaria JPEG does not match pinned legacy bytes',
 'Optimized Yaria JPEG does not match reviewed candidate',
 'Oversized Yaria original does not match pinned legacy manifest',
 'A protected GitHub owner token is required','GitHub owner authentication unavailable',
 'Authenticated GitHub identity is not the Solaris repository owner',
];
async function main(){
 if(process.env.CI)throw Error('Yaria derivative restoration forbidden in CI');
 const manifest=arg('--manifest'),candidate=arg('--candidate');
 if(!manifest||!candidate)throw Error('Provide original --manifest and reviewed --candidate JPEG');
 const files=parseStagedManifest(await readFile(resolve(manifest)));
 validateYariaManifest(files);
 const bytes=await readFile(resolve(candidate));
 const verification=validateYariaMedia(bytes);
 if(!process.argv.includes('--execute')){
  if(!process.argv.includes('--inspect'))throw Error('Unknown Yaria recovery action');
  console.log(JSON.stringify({
   mode:'offline-yaria-derivative-review',original_bytes:YARIA.original_bytes,
   candidate_bytes:verification.bytes,original_private_path:YARIA.original_path,
   destination_path:YARIA.destination_path,candidate_sha256:verification.sha256,
   public_uploaded:false,production_references_written:0,
   note:'Inspect the JPEG visually. --execute requires separate owner approval and protected credentials.'},null,2));
  return;
 }
 if(process.env.SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED!=='YES_READ_DESTINATION')
  throw Error('Protected destination read acknowledgement missing');
 if(process.env.SOLARIS_RECOVERY_YARIA_DERIVATIVE_APPROVED!==
   'I_APPROVE_PUBLISHING_VERIFIED_YARIA_OPTIMIZED_GALLERY_DERIVATIVE')
  throw Error('Storage publishing requires explicit owner approval');
 const proof=await verifyRepositoryOwner(process.env.SOLARIS_RECOVERY_GITHUB_OWNER_TOKEN||process.env.GITHUB_TOKEN);
 const token=process.env.SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY;
 if(!token)throw Error('Protected destination credential missing');
 const client=createClient(root,token,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{'X-Client-Info':'solaris-v3-owner-yaria-derivative/1'}},
 });
 const {data:state,error:stateError}=await client.from('studio2_platform_operational_state')
  .select('mode').eq('singleton',true).maybeSingle();
 if(stateError||state?.mode!=='read_only')throw Error('Destination platform is not read_only');
 const {data:buckets,error:bucketError}=await client.storage.listBuckets();
 if(bucketError||!Array.isArray(buckets)||
  buckets.find(b=>b.id==='country-media')?.public!==true||
  buckets.find(b=>b.id==='solaris-upload-quarantine')?.public!==false)
  throw Error('Storage bucket privacy check failed');
 const {data:country,error:countryError}=await client.from('countries')
  .select('id,name').eq('id',YARIA.country_id).maybeSingle();
 if(countryError||country?.name!=='Yaria')throw Error('Yaria canonical country row changed');
 const {data:refs,error:refsError}=await client.from('country_media')
  .select('id,storage_path').eq('storage_path',YARIA.destination_path).limit(1);
 if(refsError||refs?.length)throw Error('Yaria gallery has already been restored');
 const source=await client.storage.from(YARIA.original_bucket).download(YARIA.original_path);
 if(source.error||!source.data)throw Error('Private original Yaria photo is missing');
 validateYariaMedia(Buffer.from(await source.data.arrayBuffer()),{original:true});
 const destination=client.storage.from(YARIA.destination_bucket);
 const prior=await destination.download(YARIA.destination_path);
 let uploaded=false;
 if(prior.data&&!prior.error){
  try{validateYariaMedia(Buffer.from(await prior.data.arrayBuffer()));}
  catch{throw Error('Stored public candidate differs from owner reviewed JPEG');}
 }else{
  const result=await destination.upload(YARIA.destination_path,bytes,{
   contentType:'image/jpeg',upsert:false,cacheControl:'3600',
  });
  if(result.error)throw Error('Public derivative upload rejected; no reference changes performed');
  uploaded=true;
 }
 const check=await destination.download(YARIA.destination_path);
 if(check.error||!check.data)throw Error('Published optimized JPEG did not pass readback');
 validateYariaMedia(Buffer.from(await check.data.arrayBuffer()));
 const ticket='OWNER-YARIA-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
 const sql=renderYariaGalleryReferenceSql({ticket,ownerLogin:proof.github_login,gitSha:currentRecoveryHead()});
 const output=resolve(arg('--sql')||join(homedir(),'solaris-yaria-optimized-gallery-reference.sql'));
 if(!output.startsWith(homedir()+'/'))throw Error('Protected SQL may be written only in operator home');
 await writeFile(output,sql,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({
   mode:'owner-approved-yaria-public-derivative-upload-only',
   optimized_public_file_uploaded:uploaded,
   source_original_sha256_verified:true,
   public_candidate_sha256_verified:true,
   destination_path:YARIA.destination_path,
   candidate_bytes:verification.bytes,
   change_ticket:ticket,
   sql_file:output,production_references_written:0,
   note:'Original quarantine object untouched. Review SQL and execute separately in protected destination SQL Editor.'},null,2));
}
main().catch(error=>{
 const message=String(error?.message||'');
 console.error(allowed.includes(message)?message:'Yaria gallery recovery halted. Do not publish or run SQL until reviewed.');
 process.exitCode=1;
});
