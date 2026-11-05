#!/usr/bin/env node
/** Human-approved, manual-only Solaris V3 country flag reference recovery.
 * --prepare never uses credentials or production. --approve performs read-only
 * byte verification and generates SQL for an authorized operator; it never
 * writes production DB rows or Storage objects on its own.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseStagedManifest} from './lib/v3-staged-media-recovery.mjs';
import {sha256,detectMime} from './lib/v3-media-recovery-core.mjs';
import {verifyRepositoryOwner,currentRecoveryHead} from './lib/v3-owner-media-recovery.mjs';
import {buildCountryFlagReview,initialFlagSelection,validateFlagSelection,
 renderFlagReviewHtml,renderGuardedFlagSql,DESTINATION} from './lib/v3-country-flag-recovery.mjs';
const opt=key=>{const n=process.argv.indexOf(key);return n<0?null:process.argv[n+1];};
const HOME=homedir();
const selectionDefault=join(HOME,'solaris-country-flag-selection.json');
const htmlDir=join(HOME,'solaris-public-flag-preview');
const sqlDefault=join(HOME,'solaris-country-flag-reference-repair.sql');
async function main(){
 if(process.env.CI)throw Error('Production country flag recovery is forbidden in CI');
 const manifestPath=opt('--manifest');
 if(!manifestPath)throw Error('Provide --manifest ./checksums.json');
 const files=parseStagedManifest(await readFile(resolve(manifestPath)));
 const review=buildCountryFlagReview(files);
 if(process.argv.includes('--prepare')){
  const draft=resolve(opt('--output')||selectionDefault);
  await writeFile(draft,JSON.stringify(initialFlagSelection(review),null,2)+'\n',{flag:'wx',mode:0o600});
  await mkdir(htmlDir,{recursive:true,mode:0o700});
  const html=join(htmlDir,'index.html');
  await writeFile(html,renderFlagReviewHtml(review),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({mode:'read-only-flag-review',
   candidates:review.countries.length,distinct_unambiguous:review.countries.filter(c=>c.distinct_designs===1).map(c=>c.name),
   manually_choose:review.countries.filter(c=>c.distinct_designs>1).map(c=>c.name),
   preview_html:html,selection_draft:draft,public_references_written:0,
   note:'Open the HTML preview. Choose current flags, download the selected JSON, then run --approve. Never assign historical variants automatically.'},null,2));
  return;
 }
 if(!process.argv.includes('--approve'))throw Error('Use --prepare or --approve');
 if(process.env.SOLARIS_RECOVERY_FLAG_REFERENCE_APPROVED!=='I_APPROVE_SELECTED_CURRENT_COUNTRY_FLAGS')
  throw Error('Explicit current flag database reference approval missing');
 if(process.env.SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED!=='YES_READ_DESTINATION')
  throw Error('Explicit protected destination read acknowledgment missing');
 const selections=JSON.parse(await readFile(resolve(opt('--selection')||selectionDefault),'utf8'));
 const chosen=validateFlagSelection(review,selections);
 // Local fake-data tests only. Hosted production remains forbidden in CI.
 execFileSync(process.execPath,['--test','scripts/lib/v3-country-flag-recovery.test.mjs'],{
  cwd:process.cwd(),timeout:30000,stdio:'pipe',
  env:{CI:'true',NODE_ENV:'test',PATH:process.env.PATH},
 });
 const proof=await verifyRepositoryOwner(
  process.env.SOLARIS_RECOVERY_GITHUB_OWNER_TOKEN||process.env.GITHUB_TOKEN
 );
 const token=process.env.SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY;
 if(!token)throw Error('Missing protected destination Storage credential');
 const {createClient}=await import('@supabase/supabase-js');
 const client=createClient('https://'+DESTINATION+'.supabase.co',token,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{'X-Client-Info':'solaris-v3-manual-country-flag-readback/1'}},
 });
 const {data:state,error:stateError}=await client.from('studio2_platform_operational_state')
  .select('mode').eq('singleton',true).maybeSingle();
 if(stateError||state?.mode!=='read_only')throw Error('Flag recovery requires the unchanged read_only platform mode');
 const {data:buckets,error:bucketError}=await client.storage.listBuckets();
 if(bucketError||!Array.isArray(buckets)||buckets.find(b=>b.id==='country-media')?.public!==true||
   buckets.find(b=>b.id==='solaris-upload-quarantine')?.public!==false)
  throw Error('Storage privacy does not match approved recovery');
 const {data:records,error:recordError}=await client.from('countries')
  .select('id,name,flag_image').in('id',chosen.map(f=>f.country_id));
 if(recordError||!Array.isArray(records)||records.length!==chosen.length)
  throw Error('Cannot verify all selected canonical countries');
 const byId=new Map(records.map(c=>[c.id,c]));
 let verifiedBytes=0;
 for(const f of chosen){
  const c=byId.get(f.country_id);
  if(!c||c.name!==f.name||String(c.flag_image||'').trim())
   throw Error('Existing or changed current country flag; refuses repair');
  const {data,error}=await client.storage.from('country-media').download(f.path);
  if(error||!data)throw Error('Approved country flag missing in destination');
  const bytes=Buffer.from(await data.arrayBuffer());
  if(bytes.length!==f.bytes||sha256(bytes)!==f.sha256||detectMime(bytes)!==f.mime)
   throw Error('Selected destination flag does not match pinned legacy bytes');
  verifiedBytes+=bytes.length;
 }
 const ticket='OWNER-FLAGS-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
 const sql=renderGuardedFlagSql(chosen,{gitSha:currentRecoveryHead(),ownerLogin:proof.github_login,ticket});
 const output=resolve(opt('--sql')||sqlDefault);
 await writeFile(output,sql,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({mode:'reviewed-read-only-country-flag-reference-plan',
  owner:proof.github_login,selected:chosen.map(({name})=>name),
  selected_files:chosen.length,destination_sha256_verified_bytes:verifiedBytes,
  change_ticket:ticket,sql_file:output,public_references_written:0,
  note:'This command generated SQL only. Execute the SQL once through the protected destination Supabase SQL Editor after reviewing. It will refuse changed or nonempty flags.'},null,2));
}
main().catch(error=>{
 const known=[
  'Production country flag recovery is forbidden in CI','Provide --manifest ./checksums.json',
  'Use --prepare or --approve','Explicit current flag database reference approval missing',
  'Explicit protected destination read acknowledgment missing','No approved current flags selected',
  'Missing protected destination Storage credential','Flag recovery requires the unchanged read_only platform mode',
  'Storage privacy does not match approved recovery','Cannot verify all selected canonical countries',
  'Existing or changed current country flag; refuses repair',
  'Approved country flag missing in destination',
  'Selected destination flag does not match pinned legacy bytes',
  'A protected GitHub owner token is required','GitHub owner authentication unavailable',
  'Authenticated GitHub identity is not the Solaris repository owner',
  'Flag selection is not bound to the verified original manifest',
  'Duplicate or invalid flag selection','Missing country in owner flag review',
  'Selected flag does not belong to its canonical country',
 ];
 const msg=String(error?.message||'');
 console.error(known.includes(msg)?msg:'Country flag review stopped: no production changes performed');
 process.exitCode=1;
});
