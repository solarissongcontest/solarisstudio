#!/usr/bin/env node
/** Separate manual review for 25 per-edition identity flags.
 * Produces a public-image-only review, SHA-bound owner selection and guarded SQL.
 * Never changes countries.flag_image, votes, historic names or production mode.
 */
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {parseStagedManifest} from './lib/v3-staged-media-recovery.mjs';
import {sha256,detectMime} from './lib/v3-media-recovery-core.mjs';
import {verifyRepositoryOwner,currentRecoveryHead} from './lib/v3-owner-media-recovery.mjs';
import {buildHistoricalFlagReview,initialHistoricalSelection,
 validateHistoricalSelection,renderHistoricalFlagReviewHtml,
 renderHistoricalFlagSql,PROJECT} from './lib/v3-historical-country-flag-recovery.mjs';

const home=homedir();
const preview=join(home,'solaris-historical-flags-preview');
const draft=join(home,'solaris-historical-edition-flags-selection.json');
const sqlDefault=join(home,'solaris-historical-edition-flags-reference-repair.sql');
const option=k=>{const n=process.argv.indexOf(k);return n<0?null:process.argv[n+1];};
async function liveSnapshot(client){
 const {data:history,error:hError}=await client.from('country_edition_identities')
  .select('country_id,edition_id,display_name,flag_image').limit(200);
 if(hError||history?.length!==25)throw Error('Unexpected live historical edition identity inventory');
 const countriesIds=[...new Set(history.map(r=>r.country_id))];
 const editionIds=[...new Set(history.map(r=>r.edition_id))];
 const [countries,editions,entities]=await Promise.all([
  client.from('countries').select('id,name').in('id',countriesIds),
  client.from('editions').select('id,edition_number').in('id',editionIds),
  client.from('contest_entities').select('id,country_id,edition_id,entity_type,display_name,flag_image,historical_identity_override')
   .in('country_id',countriesIds).in('edition_id',editionIds).limit(500),
 ]);
 if(countries.error||editions.error||entities.error)throw Error('Unable to validate historical identity row relationships');
 const byCountry=new Map(countries.data.map(x=>[x.id,x]));
 const byEdition=new Map(editions.data.map(x=>[x.id,x]));
 const result=history.map(h=>{
  const ce=entities.data.filter(e=>e.country_id===h.country_id&&e.edition_id===h.edition_id&&e.entity_type==='global');
  if(ce.length!==1)throw Error('Historical edition contest entity relationship is not unique');
  const c=byCountry.get(h.country_id),e=byEdition.get(h.edition_id);
  if(!c||!e)throw Error('Historical edition lookup could not resolve canonical identity');
  return {...h, name:c.name,edition_number:e.edition_number,entity_id:ce[0].id,
   entity_name:ce[0].display_name,entity_flag:ce[0].flag_image,
   historical_identity_override:ce[0].historical_identity_override};
 });
 return result;
}
async function main(){
 if(process.env.CI)throw Error('Historical recovery cannot run in CI');
 const manifest=option('--manifest');
 if(!manifest)throw Error('Original --manifest ./checksums.json required');
 const files=parseStagedManifest(await readFile(resolve(manifest)));
 if(process.env.SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED!=='YES_READ_DESTINATION')
  throw Error('Protected live historical identity read acknowledgement missing');
 const token=process.env.SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY;
 if(!token)throw Error('Protected destination Storage credential missing');
 const client=createClient('https://'+PROJECT+'.supabase.co',token,{
  auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{'X-Client-Info':'solaris-v3-owner-historical-flags/1'}},
 });
 const {data:mode,error:modeError}=await client.from('studio2_platform_operational_state')
  .select('mode').eq('singleton',true).maybeSingle();
 if(modeError||mode?.mode!=='read_only')throw Error('Historical edition recovery requires read_only');
 const review=buildHistoricalFlagReview(files,await liveSnapshot(client));
 if(process.argv.includes('--prepare')){
  await mkdir(preview,{recursive:true,mode:0o700});
  await chmod(preview,0o700);
  await writeFile(join(preview,'index.html'),renderHistoricalFlagReviewHtml(review),{
   mode:0o600});
  await writeFile(resolve(option('--selection-draft')||draft),
   JSON.stringify(initialHistoricalSelection(review),null,2)+'\n',{
    flag:'wx',mode:0o600,
   });
  console.log(JSON.stringify({
   mode:'read-only-historical-edition-flag-review',
   identities:review.rows.length,eligible_edition_rows:review.rows.filter(r=>r.candidates.length).length,
   rows_without_recovered_source:review.no_source_countries,
   preview_html:join(preview,'index.html'),selection_draft:resolve(option('--selection-draft')||draft),
   production_references_written:0},null,2));
  return;
 }
 if(!process.argv.includes('--approve'))throw Error('Select --prepare or --approve');
 if(process.env.SOLARIS_RECOVERY_HISTORICAL_FLAGS_APPROVED!==
  'I_APPROVE_SELECTED_EDITION_SPECIFIC_FLAG_RESTORATION')
  throw Error('Explicit historical edition flag restoration approval missing');
 const selected=JSON.parse(await readFile(resolve(option('--selection')||draft),'utf8'));
 const chosen=validateHistoricalSelection(review,selected);
 execFileSync(process.execPath,['--test','scripts/lib/v3-historical-country-flag-recovery.test.mjs'],{
  cwd:process.cwd(),timeout:30000,stdio:'pipe',
  env:{CI:'true',NODE_ENV:'test',PATH:process.env.PATH},
 });
 const owner=await verifyRepositoryOwner(process.env.SOLARIS_RECOVERY_GITHUB_OWNER_TOKEN||
   process.env.GITHUB_TOKEN);
 let verifiedBytes=0;
 for(const file of chosen){
  const {data,error}=await client.storage.from('country-media').download(file.path);
  if(error||!data)throw Error('Selected historic flag missing from public Storage');
  const bytes=Buffer.from(await data.arrayBuffer());
  if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256||detectMime(bytes)!==file.mime)
   throw Error('Selected historical flag no longer matches original verified bytes');
  verifiedBytes+=bytes.length;
 }
 const ticket='OWNER-HISTORICAL-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
 const sql=renderHistoricalFlagSql(chosen,{ticket,gitSha:currentRecoveryHead(),
  ownerLogin:owner.github_login});
 const output=resolve(option('--sql')||sqlDefault);
 if(!output.startsWith(home+'/'))throw Error('Protected SQL must stay in operator home');
 await writeFile(output,sql,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({
  mode:'owner-reviewed-historical-flag-SQL-only',
  selected_editions:chosen.map(x=>({name:x.country_name,edition:x.edition_number})),
  selected:chosen.length,destination_sha256_verified_bytes:verifiedBytes,
  ticket,sql_file:output,production_references_written:0,
  note:'Manually review edition assignments. Only a protected SQL Editor can execute this audited repair.'},null,2));
}
main().catch(error=>{
 const allow=new Set([
  'Historical recovery cannot run in CI','Original --manifest ./checksums.json required',
  'Protected live historical identity read acknowledgement missing',
  'Protected destination Storage credential missing',
  'Historical edition recovery requires read_only',
  'Unexpected live historical edition identity inventory',
  'Unable to validate historical identity row relationships',
  'Historical edition contest entity relationship is not unique',
  'Historical edition lookup could not resolve canonical identity',
  'Select --prepare or --approve',
  'Explicit historical edition flag restoration approval missing',
  'No confirmed historical edition flag selected',
  'Historical flag selection does not match live snapshot and source manifest',
  'Selected historic flag missing from public Storage',
  'Selected historical flag no longer matches original verified bytes',
  'Protected SQL must stay in operator home',
  'A protected GitHub owner token is required',
  'GitHub owner authentication unavailable',
  'Authenticated GitHub identity is not the Solaris repository owner',
 ]);
 const msg=String(error?.message||'');
 console.error(allow.has(msg)?msg:'Historical edition review stopped; no production flag references changed');
 process.exitCode=1;
});
