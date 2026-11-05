import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from './v3-media-recovery-core.mjs';
import {FLAG_COUNTRIES,buildCountryFlagReview,initialFlagSelection,
 validateFlagSelection,renderFlagReviewHtml,renderGuardedFlagSql} from './v3-country-flag-recovery.mjs';
const otelia='94e0e2b5-7ab0-42bf-a61a-6ae04ff538da';
const counts=new Map([
 ['Abeven',3],['Linem',5],['Oland',2],['Rharaj',2],['Secsewen',1],
 ['Witfordge',2],['Yaria',4],['Zarzad',2],
]);
const files=[...FLAG_COUNTRIES,{id:otelia,name:'Otelia'}].flatMap(c=>{
 const count=counts.get(c.name)??2;
 return Array.from({length:count},(_,index)=>{
  const duplicate=['Rharaj','Zarzad','Otelia'].includes(c.name);
  const variant=duplicate?0:index;
  return {bucket:'country-media',owner:c.id,path:c.id+'/flags/sample_'+index+'.png',
   stagedPath:'country-media/'+c.id+'/flags/sample_'+index+'.png',mime:'image/png',
   size:8,sha256:sha256(Buffer.from(c.name+':'+variant))};
 });
});
test('recognizes 23 real flag keys, eight missing country refs and only truly unique image designs',()=>{
 const r=buildCountryFlagReview(files);
 assert.equal(r.countries.length,8);
 assert.deepEqual(r.countries.filter(c=>c.suggested_path).map(c=>c.name),
  ['Rharaj','Secsewen','Zarzad']);
 assert.equal(r.countries.find(c=>c.name==='Linem').distinct_designs,5);
 assert.equal(r.countries.find(c=>c.name==='Oland').distinct_designs,2);
 assert.equal(r.countries.reduce((n,c)=>n+c.candidates.length,0),21);
 assert.ok(!r.countries.some(c=>c.name==='Otelia'));
});
test('review starts with NO auto-approved flags and renders a public-only, image preview',()=>{
 const review=buildCountryFlagReview(files);
 const selection=initialFlagSelection(review);
 assert.equal(selection.countries.filter(c=>c.selected_path).length,0);
 assert.throws(()=>validateFlagSelection(review,selection),/No approved/);
 const html=renderFlagReviewHtml(review);
 for(const country of FLAG_COUNTRIES)assert.ok(html.includes(country.name));
 assert.ok(html.includes('Download reviewed flag selection JSON'));
 assert.ok(html.includes('object-fit:contain'));
 assert.ok(html.includes('data-path'));
 assert.ok(!html.includes('SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY'));
});
test('enforces exact original identity; never swaps countries or accepts a changed manifest',()=>{
 const review=buildCountryFlagReview(files);
 const selected=initialFlagSelection(review);
 selected.countries[0].selected_path=review.countries[0].candidates[0].path;
 let rows=validateFlagSelection(review,selected);
 assert.equal(rows.length,1);
 assert.equal(rows[0].name,'Abeven');
 const swapped=structuredClone(selected);
 swapped.countries[0].selected_path=review.countries[2].candidates[0].path;
 assert.throws(()=>validateFlagSelection(review,swapped),/does not belong/);
 const stale=structuredClone(selected);
 stale.manifest_sha256='1'.repeat(64);
 assert.throws(()=>validateFlagSelection(review,stale),/manifest/);
 const duplicated=structuredClone(selected);
 duplicated.countries[1].country_id=duplicated.countries[0].country_id;
 assert.throws(()=>validateFlagSelection(review,duplicated),/Duplicate/);
 rows=validateFlagSelection(review,{...selected,countries:[...selected.countries]});
 assert.equal(rows[0].country_id,FLAG_COUNTRIES[0].id);
});
test('generated SQL locks missing flags, checks exact Storage identities and audits before atomic commit',()=>{
 const review=buildCountryFlagReview(files);
 const selected=initialFlagSelection(review);
 selected.countries[4].selected_path=review.countries[4].candidates[0].path;
 const approved=validateFlagSelection(review,selected);
 const sql=renderGuardedFlagSql(approved,{
  gitSha:'a'.repeat(40),ticket:'OWNER-FLAGS-20261105190000'
 });
 assert.ok(sql.includes('BEGIN;'));
 assert.ok(sql.includes('COMMIT;'));
 assert.ok(sql.includes('FOR UPDATE OF c'));
 assert.ok(sql.includes("v_mode IS DISTINCT FROM 'read_only'"));
 assert.ok(sql.includes("AND nullif(btrim(c.flag_image),'') IS NULL"));
 assert.ok(sql.includes('v3.legacy_country_flag_recovery'));
 assert.ok(sql.includes(approved[0].sha256));
 assert.ok(sql.includes(approved[0].path));
 assert.ok(!sql.includes('country_edition_identities'));
 assert.ok(!sql.includes('ON CONFLICT'));
 const bad={...approved[0],country_id:review.countries[2].id};
 assert.throws(()=>renderGuardedFlagSql([bad],{gitSha:'a'.repeat(40),
  ticket:'OWNER-FLAGS-20261105190000'}),/Invalid current-flag candidate/);
});
test('never accepts changed evidence, duplicate country selection or malformed operator scope',()=>{
 const review=buildCountryFlagReview(files);
 const draft=initialFlagSelection(review);
 draft.countries[3].selected_path=review.countries[3].candidates[0].path;
 const chosen=validateFlagSelection(review,draft);
 assert.throws(()=>renderGuardedFlagSql([chosen[0],chosen[0]],{
  gitSha:'a'.repeat(40),ticket:'OWNER-FLAGS-20261105190000'
 }),/Invalid current-flag candidate/);
 assert.throws(()=>renderGuardedFlagSql(chosen,{gitSha:'not-a-sha',
  ticket:'OWNER-FLAGS-20261105190000'}),/scope/);
 assert.throws(()=>renderGuardedFlagSql(chosen,{gitSha:'a'.repeat(40),
  ticket:'OWNER-FLAGS-20261105190000',ownerLogin:'random'}),/scope/);
 const bad={...chosen[0],sha256:'not-pinned'};
 assert.throws(()=>renderGuardedFlagSql([bad],{gitSha:'a'.repeat(40),
  ticket:'OWNER-FLAGS-20261105190000'}),/Invalid current-flag candidate/);
});
