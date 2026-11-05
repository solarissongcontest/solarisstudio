/** Pure, offline review and auditable SQL planning for recovered legacy country flags.
 * Never chooses a historical variant by date/name and never performs a DB write.
 */
import {stagedDigest} from './v3-staged-media-recovery.mjs';

export const FLAG_COUNTRIES = Object.freeze([
 {id:'af35be30-30da-4d7c-be16-b47b162f6722',name:'Abeven'},
 {id:'652a67e3-cb31-42dc-bb0f-3ee77637bc26',name:'Linem'},
 {id:'5b3a11fd-e675-4811-930c-33bbab52ad97',name:'Oland'},
 {id:'41abd429-b67c-4c5b-aae2-4f1429b034b4',name:'Rharaj'},
 {id:'8c5260e9-bd15-4124-b95c-9a9bbaa450c0',name:'Secsewen'},
 {id:'d279aec5-3243-4109-a372-ff1f11bc9bbd',name:'Witfordge'},
 {id:'e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb',name:'Yaria'},
 {id:'b2772416-abe2-4134-bd2f-d58eb132dc0c',name:'Zarzad'},
]);
export const DESTINATION='dkxmnvekiopyesuzggeu';
export const FLAG_ROOT='https://'+DESTINATION+'.supabase.co/storage/v1/object/public/country-media/';
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const safePath=/^[a-f0-9-]{36}\/flags\/[A-Za-z0-9._-]+$/;
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");

export function buildCountryFlagReview(files) {
 const flags=files.filter(f=>f.bucket==='country-media'&&f.path.split('/')[1]==='flags');
 if(flags.length!==23)throw Error('Unexpected original legacy flag inventory');
 for(const f of flags)if(!UUID.test(f.owner)||!safePath.test(f.path)||!SHA.test(f.sha256)||
   !Number.isSafeInteger(f.size)||f.size<1||f.size>5242880||
   !['image/jpeg','image/png','image/webp'].includes(f.mime))
   throw Error('Unsafe original flag identity');
 const countries=FLAG_COUNTRIES.map(c=>{
  const candidates=flags.filter(f=>f.owner===c.id).sort((a,b)=>a.path.localeCompare(b.path))
    .map(f=>({path:f.path,sha256:f.sha256,bytes:f.size,mime:f.mime,url:FLAG_ROOT+f.path}));
  if(!candidates.length)throw Error('Missing original flags for '+c.name);
  const uniqueContents=new Set(candidates.map(c=>c.sha256));
  return {...c,candidates,distinct_designs:uniqueContents.size,
   suggested_path:uniqueContents.size===1?candidates[0].path:null};
 });
 // Otelia's existing flag is intentionally not in this repair set.
 if(countries.reduce((n,c)=>n+c.candidates.length,0)!==21)
  throw Error('Unexpected historical flag version count');
 return {report_type:'v3-public-legacy-country-flag-owner-review',
  destination_project:DESTINATION,manifest_sha256:stagedDigest(files),
  historical_snapshots_untouched:true,existing_country_flags_untouched:true,
  countries};
}
export function initialFlagSelection(review){
 return {report_type:'v3-reviewed-current-flag-selection',
  destination_project:review.destination_project,manifest_sha256:review.manifest_sha256,
  countries:review.countries.map(c=>({country_id:c.id,selected_path:null}))};
}
export function validateFlagSelection(review,selection){
 if(selection?.report_type!=='v3-reviewed-current-flag-selection'||
   selection.destination_project!==DESTINATION||selection.manifest_sha256!==review.manifest_sha256||
   !Array.isArray(selection.countries)||selection.countries.length!==review.countries.length)
   throw Error('Flag selection is not bound to the verified original manifest');
 const items=new Map();
 for(const row of selection.countries){
  if(!row||!UUID.test(row.country_id)||items.has(row.country_id)||
    !(row.selected_path===null||typeof row.selected_path==='string'))
   throw Error('Duplicate or invalid flag selection');
  items.set(row.country_id,row.selected_path);
 }
 const chosen=[];
 for(const c of review.countries){
  if(!items.has(c.id))throw Error('Missing country in owner flag review');
  const path=items.get(c.id);
  if(path===null)continue;
  const f=c.candidates.find(item=>item.path===path);
  if(!f)throw Error('Selected flag does not belong to its canonical country');
  chosen.push({country_id:c.id,name:c.name,...f});
 }
 if(!chosen.length)throw Error('No approved current flags selected');
 return chosen;
}
export function renderFlagReviewHtml(review){
 const selection=initialFlagSelection(review);
 const groups=review.countries.map(c=>{
  const variants=c.candidates.map(f=>'<button class="candidate" type="button" data-id="'+esc(c.id)+
   '" data-path="'+esc(f.path)+'" aria-pressed="false"><img loading="lazy" src="'+esc(f.url)+
   '" alt="Recovered flag option for '+esc(c.name)+'"><small>'+esc(f.path.split('/').at(-1))+
   '</small><small>SHA-256 '+esc(f.sha256.slice(0,16))+'… · '+esc(String(f.bytes))+
   ' bytes</small></button>').join('');
  return '<section class="group"><h2>'+esc(c.name)+'</h2><p>'+
    (c.distinct_designs===1?'One distinct verified image; duplicate storage keys may exist':
     c.distinct_designs+' distinct historical versions. Choose the correct CURRENT flag manually')+
    '</p><div class="candidates">'+variants+'</div><button class="clear" type="button" data-clear="'+
    esc(c.id)+'">Leave '+esc(c.name)+' unchanged</button></section>';
 }).join('');
 const state=JSON.stringify(selection).replaceAll('<','\\u003c');
 return `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Solaris V3 restored country flags – owner review</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#0e1420;color:#eaf0f7;font:15px/1.5 system-ui,sans-serif}
main{max-width:1120px;margin:auto;padding:24px}h1{font-size:clamp(24px,4vw,38px);margin:0}h2{margin:0;font-size:20px}
p{color:#b9c9d7}.intro{margin:12px 0 24px}.group{padding:20px 0;border-top:1px solid #344355}
.candidates{display:grid;grid-template-columns:repeat(auto-fill,minmax(195px,1fr));gap:12px}
.candidate{display:flex;flex-direction:column;align-items:stretch;gap:8px;min-width:0;padding:10px;border:2px solid #40536b;border-radius:12px;background:#182335;color:inherit;cursor:pointer;text-align:left}
.candidate[aria-pressed=true]{border-color:#69d7bb;box-shadow:0 0 0 2px #69d7bb55}
.candidate img{display:block;width:100%;height:146px;object-fit:contain;background:#293647}
.candidate small{overflow-wrap:anywhere;color:#c3d1de;font-size:11px}
.clear,#download{margin-top:14px;border-radius:8px;padding:10px 16px;background:#293e54;color:white;border:1px solid #8294a6;cursor:pointer}
#download{background:#2e7f68;font-weight:700;position:sticky;bottom:12px;padding:14px 20px}
#count{color:#b5eadd}</style>
<main><h1>Solaris Studio · recovered flags</h1><p class="intro">Select the CURRENT flag for each country. Historical versions must NOT be silently treated as current flags. No clicks change Supabase. Otelia and all other existing flags are untouched.</p>
<p id="count">0 selected</p>${groups}
<button id="download" type="button">Download reviewed flag selection JSON</button>
<p>Upload the JSON to your private Codespaces home folder to generate the guarded SQL. No keys, credentials or private files are embedded here.</p></main>
<script type="application/json" id="initial">${state}</script>
<script>
const s=JSON.parse(document.getElementById('initial').textContent);
const rows=new Map(s.countries.map(c=>[c.country_id,c]));
function redraw(){
 document.querySelectorAll('[data-path]').forEach(b=>b.setAttribute('aria-pressed',
 String(rows.get(b.dataset.id).selected_path===b.dataset.path)));
 document.getElementById('count').textContent=[...rows.values()].filter(x=>x.selected_path).length+' countries selected';
}
document.querySelectorAll('[data-path]').forEach(b=>b.addEventListener('click',()=>{
 rows.get(b.dataset.id).selected_path=b.dataset.path;redraw();
}));
document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{
 rows.get(b.dataset.clear).selected_path=null;redraw();
}));
document.getElementById('download').addEventListener('click',()=>{
 const bytes=JSON.stringify(s,null,2)+'\\n';
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='solaris-country-flag-selection.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
redraw();
</script></html>`;
}
export function renderGuardedFlagSql(chosen,{gitSha,ownerLogin='solarissongcontest',ticket}={}){
 if(!Array.isArray(chosen)||!chosen.length||chosen.length>FLAG_COUNTRIES.length||
   !/^[a-f0-9]{40}$/.test(gitSha||'')||ownerLogin!=='solarissongcontest'||
   !/^OWNER-FLAGS-[0-9]{14}$/.test(ticket||''))
  throw Error('Invalid reviewed owner reference repair scope');
 const set=new Set();
 const values=chosen.map(f=>{
  if(set.has(f.country_id)||!FLAG_COUNTRIES.some(c=>c.id===f.country_id&&c.name===f.name)||
     !safePath.test(f.path)||!f.path.startsWith(f.country_id+'/flags/')||
     !SHA.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<=0||f.bytes>5242880||
     !['image/jpeg','image/png','image/webp'].includes(f.mime))throw Error('Invalid current-flag candidate');
  set.add(f.country_id);
  return '('+[quote(f.country_id),quote(f.name),quote(f.path),f.bytes,quote(f.mime),
    quote(f.sha256)].join(',')+')';
 }).join(',\n    ');
 const n=chosen.length;
 const url=FLAG_ROOT.replaceAll("'","''");
 return `-- Manually approved current-flag repair, NOT a migration. GENERATED, DO NOT HAND-EDIT.
-- Expected signed-in GitHub repo owner: ${ownerLogin}. Change ticket: ${ticket}
-- Source-rehearsal git SHA: ${gitSha}
-- Selected ${n} countries only. Historical edition identities, images and existing flags remain unchanged.
-- Operator separately verified real restored bytes against original pinned SHA-256 before generating this SQL.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '25s';
DO $approved_legacy_country_flags$
DECLARE v_n integer; v_changed integer; v_mode text;
BEGIN
 IF session_user NOT IN ('postgres','supabase_admin') THEN
  RAISE EXCEPTION 'Country-flag recovery requires a protected database operator';
 END IF;
 SELECT mode INTO v_mode FROM public.studio2_platform_operational_state WHERE singleton;
 IF v_mode IS DISTINCT FROM 'read_only' THEN
  RAISE EXCEPTION 'Recovery scoped only to current read_only mode';
 END IF;
 IF (SELECT public FROM storage.buckets WHERE id='country-media') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Country-media Storage bucket privacy mismatch';
 END IF;
 CREATE TEMP TABLE _v3_approved_country_flags(
  country_id uuid PRIMARY KEY, country_name text NOT NULL, object_path text UNIQUE NOT NULL,
  expected_bytes bigint NOT NULL, expected_mime text NOT NULL, expected_sha256 text NOT NULL
 ) ON COMMIT DROP;
 INSERT INTO _v3_approved_country_flags VALUES
    ${values};
 IF (SELECT count(*) FROM _v3_approved_country_flags) <> ${n} THEN
  RAISE EXCEPTION 'Duplicate or missing approved country flag mapping';
 END IF;
 -- Lock current country rows before checking their still-unset flags.
 PERFORM c.id FROM public.countries c JOIN _v3_approved_country_flags t ON t.country_id=c.id FOR UPDATE OF c;
 SELECT count(*) INTO v_n
 FROM _v3_approved_country_flags t
 JOIN public.countries c ON c.id=t.country_id
 JOIN storage.objects o ON o.bucket_id='country-media' AND o.name=t.object_path
 WHERE c.name=t.country_name
  AND nullif(btrim(c.flag_image),'') IS NULL
  AND t.object_path LIKE c.id::text || '/flags/%'
  AND (o.metadata->>'size')::bigint=t.expected_bytes
  AND (o.metadata->>'mimetype')=t.expected_mime
  AND t.expected_sha256 ~ '^[a-f0-9]{64}$';
 IF v_n <> ${n} THEN
  RAISE EXCEPTION 'Current flag, owner or Storage identity changed; zero references restored';
 END IF;
 CREATE TEMP TABLE _v3_country_flags_before ON COMMIT DROP AS
 SELECT c.id,c.flag_image,c.updated_at,t.expected_sha256,t.object_path
 FROM public.countries c JOIN _v3_approved_country_flags t ON t.country_id=c.id;
 UPDATE public.countries c
 SET flag_image='${url}' || t.object_path, updated_at=now()
 FROM _v3_approved_country_flags t
 WHERE c.id=t.country_id AND nullif(btrim(c.flag_image),'') IS NULL;
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 IF v_changed <> ${n} THEN
  RAISE EXCEPTION 'Concurrent country update; rolling back entire current-flag repair';
 END IF;
 INSERT INTO public.admin_audit_log
  (actor_id,action,table_name,record_id,country_id,before_data,after_data)
 SELECT NULL::uuid,'v3.legacy_country_flag_recovery','countries',b.id::text,b.id,
   jsonb_build_object('flag_image',b.flag_image,'updated_at',b.updated_at),
   jsonb_build_object('flag_image',c.flag_image,'updated_at',c.updated_at,
    'source_sha256',b.expected_sha256,'object_path',b.object_path,
    'verified_owner',${quote(ownerLogin)},'change_ticket',${quote(ticket)},
    'source_rehearsal_git_sha',${quote(gitSha)},
    'evidence','manual verified destination-byte readback and owner-reviewed current version')
 FROM _v3_country_flags_before b JOIN public.countries c ON c.id=b.id;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 IF v_n <> ${n} THEN RAISE EXCEPTION 'Incomplete flag repair audit, rolling back'; END IF;
END
$approved_legacy_country_flags$;
COMMIT;
-- Read-only verification: SELECT c.name,c.flag_image FROM public.countries c
-- WHERE c.id IN (SELECT country_id FROM _v3_approved_country_flags);
`;
}
