/** Historical flag recovery is edition-scoped presentation metadata ONLY.
 * No user action here may change the canonical country's current flag.
 */
import {stagedDigest} from './v3-staged-media-recovery.mjs';
import {sha256,stableJson} from './v3-media-recovery-core.mjs';
export const PROJECT='dkxmnvekiopyesuzggeu';
export const ROOT='https://'+PROJECT+'.supabase.co/storage/v1/object/public/country-media/';
export const HISTORICAL_COUNTRIES=Object.freeze([
 {id:'c29b355e-92c7-482b-b802-58cfb2ce50dd',name:'Asteria',count:2},
 {id:'e57d2ff7-66c7-4b53-ae3f-a80f887e3950',name:'Diaria',count:6},
 {id:'652a67e3-cb31-42dc-bb0f-3ee77637bc26',name:'Linem',count:7},
 {id:'5b3a11fd-e675-4811-930c-33bbab52ad97',name:'Oland',count:1},
 {id:'94e0e2b5-7ab0-42bf-a61a-6ae04ff538da',name:'Otelia',count:2},
 {id:'e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb',name:'Yaria',count:7},
]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const E=s=>String(s).replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
const Q=s=>"'"+String(s).replaceAll("'","''")+"'";
export function buildHistoricalFlagReview(files,rows) {
 if(!Array.isArray(rows)||rows.length!==25)throw Error('Historical edition identity snapshot changed');
 const ids=new Set();
 const historical=rows.map(row=>{
  const owner=HISTORICAL_COUNTRIES.find(c=>c.id===row.country_id);
  const key=row.country_id+':'+row.edition_id;
  if(!owner||!UUID.test(row.edition_id)||!UUID.test(row.entity_id)||
   ids.has(key)||!Number.isInteger(row.edition_number)||row.edition_number<1||
   row.flag_image!=null||row.entity_flag!=null||
   row.historical_identity_override!==true||
   row.display_name!==row.entity_name||
   typeof row.display_name!=='string'||!row.display_name.trim()||
   row.name!==owner.name)
   throw Error('Historical edition identity integrity or existing flag changed');
  ids.add(key);
  const candidates=files.filter(f=>f.bucket==='country-media'&&
     f.owner===row.country_id&&f.path.startsWith(row.country_id+'/flags/'))
     .sort((a,b)=>a.path.localeCompare(b.path))
     .map(f=>({path:f.path,bytes:f.size,mime:f.mime,sha256:f.sha256,url:ROOT+f.path}));
  for(const f of candidates){
   if(!SHA.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<=0||
    f.bytes>5242880||!['image/jpeg','image/png','image/webp'].includes(f.mime))
    throw Error('Historical candidate does not match original inventory');
  }
  return {country_id:row.country_id,country_name:owner.name,
    edition_id:row.edition_id,edition_number:row.edition_number,
    entity_id:row.entity_id,display_name:row.display_name,candidates};
 }).sort((a,b)=>a.country_name.localeCompare(b.country_name)||
    a.edition_number-b.edition_number);
 for(const country of HISTORICAL_COUNTRIES){
  if(historical.filter(row=>row.country_id===country.id).length!==country.count)
   throw Error('Historical identity country counts changed');
 }
 const snapshot=historical.map(({country_id,country_name,edition_id,edition_number,
  entity_id,display_name})=>({country_id,country_name,edition_id,edition_number,
  entity_id,display_name}));
 return {
  report_type:'v3-historical-edition-flags-owner-review',
  destination_project:PROJECT,
  manifest_sha256:stagedDigest(files),
  live_identity_snapshot_sha256:sha256(stableJson(snapshot)),
  rows:historical,
  no_source_countries:historical.filter(r=>!r.candidates.length).map(r=>({
   country:r.country_name,edition_number:r.edition_number,display_name:r.display_name})),
 };
}
export function initialHistoricalSelection(review){
 return {
  report_type:'v3-historical-edition-flags-owner-selection',
  destination_project:review.destination_project,
  manifest_sha256:review.manifest_sha256,
  live_identity_snapshot_sha256:review.live_identity_snapshot_sha256,
  review_schema_version:2,
  records:review.rows.map(r=>({country_id:r.country_id,edition_id:r.edition_id,
   entity_id:r.entity_id,selected_path:null})),
 };
}
export function validateHistoricalSelection(review,selection){
 if(selection?.review_schema_version!==2)throw Error('Unsafe historical selection v1: the old review mixed countries in shared SSC editions. Generate a fresh v2 preview and reselect.');
 if(selection?.report_type!=='v3-historical-edition-flags-owner-selection'||
  selection.destination_project!==PROJECT||selection.manifest_sha256!==review.manifest_sha256||
  selection.live_identity_snapshot_sha256!==review.live_identity_snapshot_sha256||
  selection.review_schema_version!==2||
  !Array.isArray(selection.records)||selection.records.length!==25)
  throw Error('Historical flag selection does not match live snapshot and source manifest');
 const keys=new Set(),selected=[];
 for(const record of selection.records){
  const key=record?.country_id+':'+record?.edition_id;
  if(keys.has(key))throw Error('Duplicate historical country-and-edition selection');
  keys.add(key);
  const row=review.rows.find(r=>r.country_id===record?.country_id&&
   r.edition_id===record?.edition_id&&r.entity_id===record?.entity_id);
  if(!row||!(record.selected_path===null||typeof record.selected_path==='string'))
   throw Error('Unknown historical country-and-edition identity selection');
  if(record.selected_path!==null){
   const f=row.candidates.find(f=>f.path===record.selected_path);
   if(!f)throw Error('Historical flag selection mismatch for '+row.country_name+' SSC '+row.edition_number+': selected asset is not an approved flag for that country. Download a fresh corrected review and reselect.');
   selected.push({...f,...{
    country_id:row.country_id,country_name:row.country_name,
    edition_id:row.edition_id,edition_number:row.edition_number,
    entity_id:row.entity_id,display_name:row.display_name}});
  }
 }
 if(review.rows.some(r=>!keys.has(r.country_id+':'+r.edition_id)))
  throw Error('Historical selection omitted an identity');
 if(!selected.length)throw Error('No confirmed historical edition flag selected');
 return selected;
}
export function renderHistoricalFlagReviewHtml(review){
 const state=JSON.stringify(initialHistoricalSelection(review)).replace(/</g,'\\u003c');
 const groups=HISTORICAL_COUNTRIES.map(c=>{
  const records=review.rows.filter(r=>r.country_id===c.id);
  return '<section><h2>'+E(c.name)+'</h2>'+
   records.map(r=>'<div class="record"><h3>SSC '+E(r.edition_number)+
    ' · historical name: '+E(r.display_name)+'</h3>'+
    (r.candidates.length?'<div class="choices">'+r.candidates.map(f=>
     '<button type="button" class="asset" data-id="'+E(r.edition_id)+
     '" data-country="'+E(r.country_id)+'" data-path="'+E(f.path)+
     '" aria-pressed="false"><img src="'+E(f.url)+
     '" alt="Possible flag design; not automatically matched to SSC edition" loading="lazy">'+
     '<small>'+E(f.path.split('/').at(-1))+' · '+E(f.sha256.slice(0,16))+'…</small></button>'
     ).join('')+'</div>':'<p>No original country flag recovered. Leave unchanged until the historical original is located.</p>')+
    '<button type="button" data-clear="'+E(r.edition_id)+'" data-clear-country="'+E(r.country_id)+'">Keep this edition unchanged / inherit current flag</button></div>'
   ).join('')+'</section>';
 }).join('');
 return `<!doctype html><html lang="en"><meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <title>Solaris · historical edition flags</title>
 <style>*,*:before,*:after{box-sizing:border-box}
 body{background:#101722;color:#f2f6fb;font:15px/1.5 system-ui;margin:0}
 main{max-width:1150px;margin:auto;padding:24px}p{color:#bfcede}
 section{padding:22px 0;border-top:1px solid #46556a}.record{padding:12px 0;border-top:1px solid #28374b}
 h1{font-size:clamp(24px,4vw,36px)}h3{font-size:16px}
 .choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}
 button{cursor:pointer;border-radius:10px;border:1px solid #6e829b;background:#25354c;color:inherit;padding:10px}
 .asset{display:flex;flex-direction:column;text-align:left;gap:8px;min-width:0;border-width:2px}
 .asset[aria-pressed=true]{border-color:#79e6bc}
 .asset img{width:100%;height:120px;object-fit:contain;background:#33455d}
 .asset small{font-size:10px;overflow-wrap:anywhere}
 button[data-clear]{margin-top:9px}
 #download{position:sticky;bottom:10px;background:#216e56}
 #count{font-weight:bold;color:#91ecc5}</style>
 <main><h1>Solaris V3 · historical flags by edition</h1>
 <p>FIXED SELECTION V2: each selection is keyed by COUNTRY plus SSC edition, never just edition. Old downloaded selection JSON is unsafe and rejected. Each SSC edition is independent. NO flags are automatically selected, including those with dated filenames. An empty choice keeps the current country flag fallback. Asteria/Epito and Diaria/Duto need separate original assets. This page makes no production changes.</p>
 <p id="count">0 historical editions selected</p>${groups}
 <button id="download" type="button">Download reviewed historical edition flag selection JSON</button>
 </main><script id="state" type="application/json">${state}</script>
 <script>const data=JSON.parse(document.getElementById('state').textContent);
 const selectionKey=(countryId,editionId)=>countryId+':'+editionId;
 const selected=new Map(data.records.map(r=>[selectionKey(r.country_id,r.edition_id),r]));
 function redraw(){
  document.querySelectorAll('.asset').forEach(b=>b.setAttribute('aria-pressed',
   String(selected.get(selectionKey(b.dataset.country,b.dataset.id)).selected_path===b.dataset.path)));
  document.getElementById('count').textContent=data.records.filter(r=>r.selected_path).length+
  ' historical editions selected';
 }
 document.querySelectorAll('.asset').forEach(b=>b.addEventListener('click',()=>{
  selected.get(selectionKey(b.dataset.country,b.dataset.id)).selected_path=b.dataset.path;redraw();
 }));
 document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{
  selected.get(selectionKey(b.dataset.clearCountry,b.dataset.clear)).selected_path=null;redraw();
 }));
 document.getElementById('download').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='solaris-historical-edition-flags-selection-v2.json';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });redraw();</script></html>`;
}
export function renderHistoricalFlagSql(chosen,{ticket,gitSha,ownerLogin='solarissongcontest'}={}){
 if(!Array.isArray(chosen)||chosen.length<1||chosen.length>17||
  !/^OWNER-HISTORICAL-[0-9]{14}$/.test(ticket||'')||
  !/^[a-f0-9]{40}$/.test(gitSha||'')||ownerLogin!=='solarissongcontest')
  throw Error('Invalid historical flag recovery authorization');
 const keys=new Set();
 const values=chosen.map(f=>{
  const key=f.country_id+':'+f.edition_id;
  if(keys.has(key)||!HISTORICAL_COUNTRIES.some(c=>c.id===f.country_id&&c.name===f.country_name)||
    !UUID.test(f.edition_id)||!UUID.test(f.entity_id)||
    !f.path.startsWith(f.country_id+'/flags/')||!SHA.test(f.sha256)||
    !Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>5242880||
    !['image/jpeg','image/png','image/webp'].includes(f.mime)||
    !Number.isInteger(f.edition_number)||f.edition_number<1)
   throw Error('Unsafe selected historical identity mapping');
  keys.add(key);
  return '('+[Q(f.country_id),Q(f.country_name),Q(f.edition_id),f.edition_number,
   Q(f.entity_id),Q(f.display_name),Q(f.path),f.bytes,Q(f.mime),Q(f.sha256)].join(',')+')';
 }).join(',\n  ');
 const count=chosen.length;
 return `-- Solaris reviewed historical flag references, NEVER current flags.
-- Owner: ${ownerLogin}; change ticket: ${ticket}; exact code head: ${gitSha}
-- Every selected country+edition is a distinct owner-reviewed mapping.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $approved_historical_solaris_flags$
DECLARE v_mode text; v_count integer;
BEGIN
 IF session_user NOT IN ('postgres','supabase_admin') THEN
  RAISE EXCEPTION 'Historical flags require protected operator';
 END IF;
 SELECT mode INTO v_mode FROM public.studio2_platform_operational_state WHERE singleton;
 IF v_mode IS DISTINCT FROM 'read_only' THEN
  RAISE EXCEPTION 'Historical flag recovery requires unchanged read_only mode';
 END IF;
 IF (SELECT public FROM storage.buckets WHERE id='country-media') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Public country-media bucket configuration changed';
 END IF;
 CREATE TEMP TABLE _approved_historical_flags(
  country_id uuid NOT NULL, country_name text NOT NULL,edition_id uuid NOT NULL,
  edition_number integer NOT NULL,entity_id uuid NOT NULL, display_name text NOT NULL,
  object_path text NOT NULL,expected_bytes bigint NOT NULL,
  expected_mime text NOT NULL,expected_sha256 text NOT NULL,
  PRIMARY KEY(country_id,edition_id)
 ) ON COMMIT DROP;
 INSERT INTO _approved_historical_flags VALUES
 ${values};
 IF (SELECT count(*) FROM _approved_historical_flags)<>${count} THEN
  RAISE EXCEPTION 'Duplicate historical edition selection';
 END IF;
 PERFORM h.country_id FROM public.country_edition_identities h
  JOIN _approved_historical_flags a ON a.country_id=h.country_id AND a.edition_id=h.edition_id
  FOR UPDATE OF h;
 PERFORM ce.id FROM public.contest_entities ce
  JOIN _approved_historical_flags a ON a.entity_id=ce.id
  FOR UPDATE OF ce;
 SELECT count(*) INTO v_count
 FROM _approved_historical_flags a
 JOIN public.countries c ON c.id=a.country_id AND c.name=a.country_name
 JOIN public.editions e ON e.id=a.edition_id AND e.edition_number=a.edition_number
 JOIN public.country_edition_identities h ON h.country_id=a.country_id
  AND h.edition_id=a.edition_id AND h.display_name=a.display_name
 JOIN public.contest_entities ce ON ce.id=a.entity_id AND ce.country_id=a.country_id
  AND ce.edition_id=a.edition_id AND ce.entity_type='global'
  AND ce.historical_identity_override=true AND ce.display_name=a.display_name
 JOIN storage.objects o ON o.bucket_id='country-media' AND o.name=a.object_path
 WHERE nullif(btrim(h.flag_image),'') IS NULL
  AND nullif(btrim(ce.flag_image),'') IS NULL
  AND a.object_path LIKE a.country_id::text || '/flags/%'
  AND (o.metadata->>'size')::bigint=a.expected_bytes
  AND (o.metadata->>'mimetype')=a.expected_mime
  AND a.expected_sha256 ~ '^[a-f0-9]{64}$';
 IF v_count<>${count} THEN
  RAISE EXCEPTION 'Historical country, edition, entity or verified Storage record changed';
 END IF;
 UPDATE public.country_edition_identities h
 SET flag_image=${Q(ROOT)} || a.object_path,updated_at=now()
 FROM _approved_historical_flags a WHERE h.country_id=a.country_id AND h.edition_id=a.edition_id;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>${count} THEN RAISE EXCEPTION 'Historical identity update failed'; END IF;
 UPDATE public.contest_entities ce
 SET flag_image=${Q(ROOT)} || a.object_path,updated_at=now()
 FROM _approved_historical_flags a WHERE ce.id=a.entity_id;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>${count} THEN RAISE EXCEPTION 'Historical contest entity update failed'; END IF;
 INSERT INTO public.admin_audit_log(
  actor_id,action,table_name,record_id,country_id,edition_id,before_data,after_data)
 SELECT NULL::uuid,'v3.legacy_historical_country_flag_recovery',
  'country_edition_identities',a.country_id::text||':'||a.edition_id::text,
  a.country_id,a.edition_id,
  jsonb_build_object('historical_flag_image',NULL,'entity_flag_image',NULL),
  jsonb_build_object('historical_flag_image',h.flag_image,'entity_flag_image',ce.flag_image,
   'source_sha256',a.expected_sha256,'path',a.object_path,'ticket',${Q(ticket)},
   'owner',${Q(ownerLogin)},'code_sha',${Q(gitSha)})
 FROM _approved_historical_flags a
 JOIN public.country_edition_identities h ON h.country_id=a.country_id AND h.edition_id=a.edition_id
 JOIN public.contest_entities ce ON ce.id=a.entity_id;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>${count} THEN RAISE EXCEPTION 'Historical flag audit insertion incomplete'; END IF;
END
$approved_historical_solaris_flags$;
COMMIT;
-- Historical flags only; neither public.countries nor country design changed.
SELECT c.name,e.edition_number,h.display_name,h.flag_image
 FROM public.country_edition_identities h
 JOIN public.countries c ON c.id=h.country_id
 JOIN public.editions e ON e.id=h.edition_id
 WHERE (h.country_id,h.edition_id) IN (
 ${chosen.map(f=>'('+Q(f.country_id)+'::uuid,'+Q(f.edition_id)+'::uuid)').join(',\n ')}
 )
 ORDER BY c.name,e.edition_number;
`;
}
