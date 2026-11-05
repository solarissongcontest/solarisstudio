import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from './v3-media-recovery-core.mjs';
import {
 HISTORICAL_COUNTRIES,buildHistoricalFlagReview,initialHistoricalSelection,
 validateHistoricalSelection,renderHistoricalFlagReviewHtml,renderHistoricalFlagSql
} from './v3-historical-country-flag-recovery.mjs';
const hash=s=>sha256(Buffer.from(s));
const input=(()=>{
 const rows=[],files=[];
 let n=0;
 for(const country of HISTORICAL_COUNTRIES){
  for(let j=0;j<country.count;j++){
   n++;
   const editionId='00000000-0000-4000-8000-'+String(n).padStart(12,'0');
   const entityId='11111111-1111-4111-8111-'+String(n).padStart(12,'0');
   rows.push({
    name:country.name,country_id:country.id,edition_id:editionId,
    edition_number:n,entity_id:entityId,
    display_name:country.name==='Asteria'?'Epito':country.name==='Diaria'?'Duto':country.name,
    entity_name:country.name==='Asteria'?'Epito':country.name==='Diaria'?'Duto':country.name,
    flag_image:null,entity_flag:null,historical_identity_override:true,
   });
  }
  if(!['Asteria','Diaria'].includes(country.name)){
   files.push({
    bucket:'country-media',owner:country.id,sha256:hash(country.name),
    path:country.id+'/flags/image1.png',
    size:2200,mime:'image/png',
   });
  }
 }
 return {rows,files};
})();
test('builds 25 explicit historic edition entries, but does not invent Asteria/Diaria flags',()=>{
 const review=buildHistoricalFlagReview(input.files,input.rows);
 assert.equal(review.rows.length,25);
 assert.equal(review.no_source_countries.length,8);
 assert.equal(review.rows.filter(x=>x.candidates.length).length,17);
 assert.equal(review.rows.find(x=>x.country_name==='Asteria').display_name,'Epito');
});
test('nothing is preapproved and HTML separates each SSC edition',()=>{
 const review=buildHistoricalFlagReview(input.files,input.rows);
 const draft=initialHistoricalSelection(review);
 assert.equal(draft.records.length,25);
 assert.equal(draft.records.filter(x=>x.selected_path).length,0);
 assert.throws(()=>validateHistoricalSelection(review,draft),/No confirmed/);
 const html=renderHistoricalFlagReviewHtml(review);
 assert.match(html,/SSC /);
 assert.match(html,/No original country flag recovered/);
 assert.match(html,/object-fit:contain/);
 assert.match(html,/historical edition flag selection JSON/);
});
test('only exact edition-owner-scoped candidates can be selected',()=>{
 const review=buildHistoricalFlagReview(input.files,input.rows);
 const selection=initialHistoricalSelection(review);
 const row=review.rows.find(x=>x.country_name==='Linem');
 const i=selection.records.findIndex(x=>x.edition_id===row.edition_id);
 selection.records[i].selected_path=row.candidates[0].path;
 const chosen=validateHistoricalSelection(review,selection);
 assert.equal(chosen.length,1);
 assert.equal(chosen[0].edition_id,row.edition_id);
 const wrong=structuredClone(selection);
 wrong.records[i].selected_path=review.rows.find(x=>x.country_name==='Yaria').candidates[0].path;
 assert.throws(()=>validateHistoricalSelection(review,wrong),/does not match canonical/);
 const stale=structuredClone(selection);
 stale.live_identity_snapshot_sha256='0'.repeat(64);
 assert.throws(()=>validateHistoricalSelection(review,stale),/snapshot/);
 const dup=structuredClone(selection);
 dup.records[1].edition_id=dup.records[0].edition_id;
 assert.throws(()=>validateHistoricalSelection(review,dup),/Duplicate/);
});
test('SQL changes only historical edition identity and historical entity flag with audit',()=>{
 const review=buildHistoricalFlagReview(input.files,input.rows);
 const selection=initialHistoricalSelection(review);
 const row=review.rows.find(x=>x.country_name==='Oland');
 selection.records.find(x=>x.edition_id===row.edition_id).selected_path=row.candidates[0].path;
 const chosen=validateHistoricalSelection(review,selection);
 const sql=renderHistoricalFlagSql(chosen,{
  ticket:'OWNER-HISTORICAL-20261105210000',gitSha:'a'.repeat(40)});
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
 assert.match(sql,/UPDATE public.country_edition_identities/);
 assert.match(sql,/UPDATE public.contest_entities/);
 assert.match(sql,/historical_identity_override=true/);
 assert.match(sql,/v3.legacy_historical_country_flag_recovery/);
 assert.match(sql,/read_only/);
 assert.match(sql,/FOR UPDATE OF ce/);
 assert.ok(!sql.includes('UPDATE public.countries'));
 assert.ok(!sql.includes('UPDATE public.voters'));
 assert.ok(!sql.includes('DELETE FROM'));
});
test('rejects forged authorization and existing historic flag changes',()=>{
 const old=structuredClone(input.rows);
 old[0].entity_flag='https://existing.example/flag.png';
 assert.throws(()=>buildHistoricalFlagReview(input.files,old),/integrity or existing flag changed/);
 const review=buildHistoricalFlagReview(input.files,input.rows);
 const draft=initialHistoricalSelection(review);
 const row=review.rows.find(x=>x.country_name==='Yaria');
 draft.records.find(x=>x.edition_id===row.edition_id).selected_path=row.candidates[0].path;
 const chosen=validateHistoricalSelection(review,draft);
 assert.throws(()=>renderHistoricalFlagSql(chosen,{ticket:'not-authorized',gitSha:'a'.repeat(40)}),/authorization/);
 assert.throws(()=>renderHistoricalFlagSql(chosen,{ticket:'OWNER-HISTORICAL-20261105210000',gitSha:'wrong'}),/authorization/);
});
