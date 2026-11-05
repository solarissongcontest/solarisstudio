/** Legacy public-media staging recovery. Never automatically runs in CI. */
import { createHash } from 'node:crypto';
import { assertApprovedWrite, assertAssetClearance, detectMime, stableJson, validatePath } from './v3-media-recovery-core.mjs';
import { assertOwnerAuthorization, OWNER_METHOD } from './v3-owner-media-recovery.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');
const STAGING = 'solaris-upload-quarantine';
const TARGET_PROJECT = 'dkxmnvekiopyesuzggeu';
const SOURCE_PUBLIC_ROOT = 'https://oxtbskojiexkaspputvo.supabase.co/storage/v1/object/public/';
const MANIFEST_HASH = '268e75f2bc3c25f324542b90f5350c7fcbff5b2eddfe83f97e3b2a894355a4b4';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseStagedManifest(raw) {
 if(sha(raw)!==MANIFEST_HASH)throw Error('Unexpected original inventory digest');
 const doc=JSON.parse(Buffer.from(raw).toString('utf8'));
 if(doc.manifest_sha256!=='ee04295f51114edce44b82f465ba482bcaf9aa7d25777327ad5e2acf3a69019e')
  throw Error('Unexpected legacy manifest identity');
 const files=Object.entries(doc.objects||{}).map(([key,rec])=>{
  validatePath(key);
  const [bucket,owner,folder,file]=key.split('/');
  if(!UUID.test(owner||'') || !['country-media','edition-artwork'].includes(bucket) ||
     (bucket==='country-media' && (!['flags','gallery','backgrounds'].includes(folder)||!file)) ||
     (bucket==='edition-artwork' && file!==undefined) ||
     !['image/jpeg','image/png','image/webp'].includes(rec.mime) ||
     !Number.isSafeInteger(rec.size)||rec.size<1||rec.size>8*1024*1024||
     !/^[a-f0-9]{64}$/.test(rec.sha256||'') ||
     rec.source_url!==SOURCE_PUBLIC_ROOT+key) throw Error('Unsafe legacy object identity');
  return {bucket,path:key.slice(bucket.length+1),stagedPath:key,owner,
    size:rec.size,mime:rec.mime,sha256:rec.sha256};
 }).sort((a,b)=>a.stagedPath.localeCompare(b.stagedPath));
 if(files.length!==54||files.filter(f=>f.bucket==='country-media').length!==47||
    files.filter(f=>f.bucket==='edition-artwork').length!==7||
    files.reduce((n,f)=>n+f.size,0)!==25673162)throw Error('Incomplete legacy inventory');
 return files;
}
/** Stable, inspectable legacy evidence derived from the pinned historical public
 * URL inventory and byte-level quarantine SHA-256 verification. These are not
 * fabricated V3 publication receipts; owner approval attests prior visibility.
 */
export function legacyOwnerEvidence(f) {
 const original_public_url=SOURCE_PUBLIC_ROOT+f.stagedPath;
 return {
  original_public_url,
  legacy_source_manifest_sha256:MANIFEST_HASH,
  owner_attests_formerly_public:true,
  publication_evidence_id:'legacy-public-url-sha256:'+sha(Buffer.from(original_public_url)),
  validation_evidence_id:'verified-quarantine-sha256:'+f.sha256,
 };
}
export function stagedDigest(files) {
 return sha(stableJson(files.map(({bucket,path,size,mime,sha256})=>({bucket,path,size,mime,sha256}))));
}
export function assertScopedMode(mode,approval,ack,ownerProof=null,now=new Date()) {
 // A sole owner may authorize a narrowly scoped legacy-public restoration without
 // inventing a second person. GitHub verifies the actual repository owner on each
 // manual execute, and the proof stays fresh even when mode is not read_only.
 const ownerAuthorized=assertOwnerAuthorization(approval,ownerProof,now);
 if(mode==='normal'||mode==='degraded')return;
 const ex=approval?.read_only_recovery_exception;
 const scoped=mode==='read_only'&&ack==='APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY'&&
   ex?.scope==='historical-public-media-only'&&ex?.destination_project===TARGET_PROJECT&&
   ex?.keeps_confirmation_and_general_mutations_locked===true&&
   ex?.change_ticket===approval?.change_ticket&&typeof ex?.reason==='string'&&
   ex.reason.trim().length>0;
 const reviewerValid=ownerAuthorized
   ? ex?.approval_method===OWNER_METHOD&&ex?.owner_github_login===approval.owner_authorization.github_login&&
     !ex?.independent_reviewer
   : !ex?.approval_method&&typeof ex?.independent_reviewer==='string'&&
     ex.independent_reviewer.trim().length>0&&ex.independent_reviewer!==approval?.operator;
 if(!scoped||!reviewerValid)throw Error('Platform mode blocks unapproved media publication');
}
export async function verifyStaging(client,files) {
 const {data: buckets,error}=await client.storage.listBuckets();
 if(error||!Array.isArray(buckets))throw Error('Storage bucket inventory unavailable');
 const b=new Map(buckets.map(x=>[x.id,x.public]));
 if(b.get(STAGING)!==false||b.get('country-media')!==true||
    b.get('edition-artwork')!==true)throw Error('Bucket privacy mismatch');
 const out=[];
 for(const f of files){
  const {data,error:err}=await client.storage.from(STAGING).download(f.stagedPath);
  if(err||!data)throw Error('Private staged asset missing');
  const bytes=Buffer.from(await data.arrayBuffer());
  if(bytes.length!==f.size||sha(bytes)!==f.sha256||detectMime(bytes)!==f.mime)
    throw Error('Private staged asset integrity mismatch');
  out.push({...f,bytes});
 }
 return out;
}
async function targetStatus(client,f){
 const {data,error}=await client.storage.from(f.bucket).download(f.path);
 if(error){
  if(String(error.statusCode||error.status)==='404')return 'missing';
  throw Error('Destination availability cannot be established');
 }
 if(!data)throw Error('Destination contains no readable bytes');
 const bytes=Buffer.from(await data.arrayBuffer());
 return bytes.length===f.size&&sha(bytes)===f.sha256?'identical':'collision';
}
export async function restoreApprovedStaging({
 client,files,approval,signingKey,manualAck,readOnlyAck,readMode,ownerProof=null,
 ci=process.env.CI,clock=()=>new Date(),checkpoint=async()=>{}
}){
 const check=async()=>{
  assertApprovedWrite({approval,key:signingKey,digest:stagedDigest(files),ci,manualAck,now:clock()});
  assertScopedMode(await readMode(),approval,readOnlyAck,ownerProof,clock());
 };
 await check();
 const byId=new Map(files.map(f=>[f.bucket+'/'+f.path+'#'+f.sha256,f]));
 if(!Array.isArray(approval.reviewed_assets)||approval.reviewed_assets.length<1||
    new Set(approval.reviewed_assets).size!==approval.reviewed_assets.length)
    throw Error('Invalid reviewed file set');
 const selected=approval.reviewed_assets.map(id=>{
  const f=byId.get(id);
  if(!f||f.size>5242880)throw Error('Legacy asset ineligible for publication');
  assertAssetClearance({bucket:f.bucket,path:f.path,source_sha256:f.sha256,source_bytes:f.size,
    source_mime:f.mime,private:false},approval);
  const clearance=approval.asset_clearances.find(a=>a?.identity===id);
  if(clearance?.canonical_subject_id!==f.owner)throw Error('Canonical asset owner mismatch');
  if(approval.owner_authorization){
   const legacy=legacyOwnerEvidence(f);
   if(Object.entries(legacy).some(([key,value])=>clearance?.[key]!==value))
    throw Error('Owner recovery legacy-public provenance or validation evidence mismatch');
  }
  return f;
 });
 if(approval.asset_clearances?.length!==selected.length)throw Error('Unreviewed clearance in approval');
 const verified=await verifyStaging(client,selected);
 for(const f of verified)if(await targetStatus(client,f)==='collision')throw Error('Destination key collision');
 const count={copied:0,already_identical:0,verified_ambiguous:0};
 for(const f of verified){
  await check();
  const status=await targetStatus(client,f);
  if(status==='collision')throw Error('Destination changed to conflicting bytes');
  if(status==='identical'){count.already_identical++;await checkpoint({path:f.stagedPath,status});continue;}
  const {error}=await client.storage.from(f.bucket).upload(f.path,f.bytes,{upsert:false,contentType:f.mime});
  if(await targetStatus(client,f)!=='identical')throw Error('Destination hash verification failed');
  count[error?'verified_ambiguous':'copied']++;
  await checkpoint({path:f.stagedPath,status:error?'verified_ambiguous':'copied'});
 }
 return {...count,selected:selected.length,private_originals_retained:true,db_references_written:0};
}
