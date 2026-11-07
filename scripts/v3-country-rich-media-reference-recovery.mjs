#!/usr/bin/env node
/** Manual Solaris V3 owner review for recovered country backgrounds and gallery files.
 * The only production operations in this command are read-only checks and file SHA-256 readbacks.
 * It writes a local SQL document; a privileged operator must separately review and execute it.
 */
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { parseStagedManifest } from './lib/v3-staged-media-recovery.mjs';
import { sha256, detectMime } from './lib/v3-media-recovery-core.mjs';
import { verifyRepositoryOwner, currentRecoveryHead } from './lib/v3-owner-media-recovery.mjs';
import {
  buildRichMediaReview, initialRichMediaSelection, validateRichMediaSelection,
  renderRichMediaReviewHtml, PROJECT,
} from './lib/v3-country-rich-media-recovery.mjs';
import { renderCountryRichMediaSql } from './lib/v3-country-rich-media-sql.mjs';

const home=homedir();
const previewDir=join(home,'solaris-public-rich-media-preview');
const selectionDraft=join(home,'solaris-country-rich-media-selection.json');
const defaultSql=join(home,'solaris-country-rich-media-reference-repair.sql');
function option(name) {
  const n=process.argv.indexOf(name);
  if(n>=0 && !process.argv[n+1]) throw Error('Missing value for '+name);
  return n<0?null:process.argv[n+1];
}
async function main() {
  if(process.env.CI) throw Error('Manual recovery forbidden in CI');
  const manifestPath=option('--manifest');
  if(!manifestPath) throw Error('Supply original --manifest ./checksums.json');
  const files=parseStagedManifest(await readFile(resolve(manifestPath)));
  const review=buildRichMediaReview(files);
  if(process.argv.includes('--prepare')) {
    await mkdir(previewDir,{recursive:true,mode:0o700});
    await chmod(previewDir,0o700);
    await writeFile(join(previewDir,'index.html'),renderRichMediaReviewHtml(review),
      {mode:0o600});
    await writeFile(resolve(option('--selection-draft')||selectionDraft),
      JSON.stringify(initialRichMediaSelection(review),null,2)+'\n',
      {mode:0o600,flag:'wx'});
    console.log(JSON.stringify({
      mode:'read-only-rich-media-owner-review',files:23,
      background_candidates:14,background_countries:8,
      gallery_candidates:9,gallery_countries:5,
      private_oversized_gallery_excluded:1,
      preview_html:join(previewDir,'index.html'),
      selection_draft:resolve(option('--selection-draft')||selectionDraft),
      database_references_written:0
    },null,2));
    return;
  }
  if(!process.argv.includes('--approve'))throw Error('Select --prepare or --approve');
  if(process.env.SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED!=='YES_READ_DESTINATION')
    throw Error('Explicit protected destination read acknowledgement required');
  if(process.env.SOLARIS_RECOVERY_RICH_MEDIA_REFERENCES_APPROVED!==
    'I_APPROVE_SELECTED_COUNTRY_BACKGROUNDS_AND_GALLERIES')
    throw Error('Explicit background/gallery recovery decision missing');
  const selectionPath=resolve(option('--selection')||selectionDraft);
  const selection=JSON.parse(await readFile(selectionPath,'utf8'));
  const chosen=validateRichMediaSelection(review,selection);
  execFileSync(process.execPath,['--test',
    'scripts/lib/v3-country-rich-media-recovery.test.mjs'],{
    cwd:process.cwd(),timeout:30000,stdio:'pipe',
    env:{CI:'true',NODE_ENV:'test',PATH:process.env.PATH},
  });
  const proof=await verifyRepositoryOwner(process.env.SOLARIS_RECOVERY_GITHUB_OWNER_TOKEN
    || process.env.GITHUB_TOKEN);
  const token=process.env.SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY;
  if(!token)throw Error('Protected destination Storage credential missing');
  const client=createClient('https://'+PROJECT+'.supabase.co',token,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{'X-Client-Info':'solaris-v3-manual-rich-media-readback/1'}},
  });
  const {data:state,error:stateError}=await client.from('studio2_platform_operational_state')
    .select('mode').eq('singleton',true).maybeSingle();
  if(stateError||state?.mode!=='read_only')throw Error('Destination must remain read_only');
  const {data:buckets,error:bucketsError}=await client.storage.listBuckets();
  if(bucketsError||!Array.isArray(buckets)||
      buckets.find(x=>x.id==='country-media')?.public!==true||
      buckets.find(x=>x.id==='solaris-upload-quarantine')?.public!==false)
    throw Error('Storage privacy does not match protected recovery');
  const owners=[...new Set(chosen.files.map(x=>x.country_id))];
  const {data:countries,error:countriesError}=await client.from('countries')
    .select('id,name').in('id',owners);
  if(countriesError||!countries||countries.length!==owners.length)
    throw Error('Canonical country ownership validation failed');
  const byOwner=new Map(countries.map(x=>[x.id,x]));
  for(const asset of chosen.files) {
    if(byOwner.get(asset.country_id)?.name!==asset.country_name)
      throw Error('Canonical country identity changed');
  }
  if(chosen.backgrounds.length) {
    const {data:themes,error:themesError}=await client.from('country_themes')
      .select('country_id,background_mode,background_image_url,background_image_storage_path,design_version,design_v2')
      .in('country_id',chosen.backgrounds.map(x=>x.country_id));
    if(themesError||!themes||themes.length!==chosen.backgrounds.length)
      throw Error('Cannot inspect selected V2 background themes');
    for(const theme of themes){
      const background=theme.design_v2?.background;
      if(theme.design_version!==2 || theme.background_mode!=='gradient' ||
        theme.background_image_url!=null || theme.background_image_storage_path!=null ||
        !background || typeof background!=='object' ||
        background.mode!=='gradient' || background.imageUrl!=null ||
        background.imageStoragePath!=null)
        throw Error('Background theme has changed since review: no SQL generated');
    }
  }
  if(chosen.galleries.length) {
    const galleryOwners=[...new Set(chosen.galleries.map(x=>x.country_id))];
    const {data:existing,error:existingError}=await client.from('country_media')
      .select('id,country_id,storage_path').in('country_id',galleryOwners).limit(1);
    if(existingError||!existing||existing.length)
      throw Error('Existing country gallery records; refuse duplicate restoration');
  }
  let bytesVerified=0;
  for(const asset of chosen.files) {
    const {data,error}=await client.storage.from('country-media').download(asset.path);
    if(error||!data)throw Error('Selected public country-media object unavailable');
    const bytes=Buffer.from(await data.arrayBuffer());
    if(bytes.length!==asset.bytes || detectMime(bytes)!==asset.mime ||
       sha256(bytes)!==asset.sha256)
      throw Error('Selected original media SHA-256, bytes or MIME mismatch');
    bytesVerified+=bytes.length;
  }
  const ticket='OWNER-RICH-MEDIA-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
  const sql=renderCountryRichMediaSql(chosen,{
    ticket,gitSha:currentRecoveryHead(),ownerLogin:proof.github_login,
  });
  const output=resolve(option('--sql')||defaultSql);
  if(!output.startsWith(home+'/'))throw Error('Generated SQL must stay in private operator home');
  await writeFile(output,sql,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({
    mode:'reviewed-rich-media-reference-SQL-only',
    approved_backgrounds:chosen.backgrounds.map(x=>x.country_name),
    approved_galleries:chosen.galleries.map(x=>x.country_name),
    approved_files:chosen.files.length,
    verified_sha256_bytes:bytesVerified,
    ticket,sql_file:output,production_references_written:0,
    note:'Manually review generated SQL. Run once in protected Supabase SQL Editor only after separate explicit production authorization.',
  },null,2));
}
main().catch(error=>{
 const allowed=new Set([
   'Manual recovery forbidden in CI',
   'Supply original --manifest ./checksums.json',
   'Select --prepare or --approve',
   'Explicit protected destination read acknowledgement required',
   'Explicit background/gallery recovery decision missing',
   'No country backgrounds or gallery images approved',
   'Protected destination Storage credential missing',
   'Destination must remain read_only',
   'Storage privacy does not match protected recovery',
   'Canonical country ownership validation failed',
   'Canonical country identity changed',
   'Cannot inspect selected V2 background themes',
   'Background theme has changed since review: no SQL generated',
   'Existing country gallery records; refuse duplicate restoration',
   'Selected public country-media object unavailable',
   'Selected original media SHA-256, bytes or MIME mismatch',
   'Generated SQL must stay in private operator home',
 ]);
 const message=String(error?.message||'');
 console.error(allowed.has(message)?message:'Country rich-media review stopped; no production references changed');
 process.exitCode=1;
});
