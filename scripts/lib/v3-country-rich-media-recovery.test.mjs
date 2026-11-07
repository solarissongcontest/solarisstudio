import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  RECOVERABLE_COUNTRIES, buildRichMediaReview, initialRichMediaSelection,
  validateRichMediaSelection, renderRichMediaReviewHtml,
} from './v3-country-rich-media-recovery.mjs';
import { renderCountryRichMediaSql } from './v3-country-rich-media-sql.mjs';
const assetCounts = new Map([
  ['Aquliateria',[1,0]],['Bentagya',[0,1]],['Diaria',[3,0]],
  ['Jaudia',[1,3]],['Linem',[2,0]],['Oland',[1,1]],
  ['Temia',[1,0]],['Vendia',[0,1]],['Yaria',[4,3]],
  ['Zarzad',[1,0]],
]);
const digest = value => createHash('sha256').update(String(value)).digest('hex');
const candidate = (country,kind,index,oversized=false) => ({
  bucket:'country-media',owner:country.id,
  path:country.id+'/'+kind+'/asset-'+index+'.jpeg',
  stagedPath:'country-media/'+country.id+'/'+kind+'/asset-'+index+'.jpeg',
  size:oversized?5679181:3000+index,mime:'image/jpeg',
  sha256:digest(country.id+kind+index),
});
const files=RECOVERABLE_COUNTRIES.flatMap(country=>{
  const [bg,gallery]=assetCounts.get(country.name);
  return [
    ...Array.from({length:bg},(_,i)=>candidate(country,'backgrounds',i)),
    ...Array.from({length:gallery},(_,i)=>candidate(country,'gallery',i)),
  ];
});
files.push(candidate(RECOVERABLE_COUNTRIES.find(c=>c.name==='Yaria'),'gallery',99,true));
const review=()=>buildRichMediaReview(files);
const ticket='OWNER-RICH-MEDIA-20261105200000';
const opts={gitSha:'a'.repeat(40),ticket};
test('recognizes precisely 14 existing public background and 9 public gallery objects',()=>{
  const r=review();
  assert.equal(r.countries.length,10);
  assert.equal(r.countries.reduce((n,c)=>n+c.backgrounds.length,0),14);
  assert.equal(r.countries.reduce((n,c)=>n+c.gallery.length,0),9);
  assert.ok(r.oversized_original_excluded);
  assert.ok(!r.countries.some(c=>c.gallery.some(f=>f.path.endsWith('asset-99.jpeg'))));
});
test('selection starts with no production changes, no gallery rows and no active backgrounds',()=>{
  const r=review(),initial=initialRichMediaSelection(r);
  assert.equal(initial.backgrounds.length,8);
  assert.equal(initial.gallery.length,9);
  assert.equal(initial.backgrounds.filter(x=>x.selected_path).length,0);
  assert.equal(initial.gallery.filter(x=>x.restore).length,0);
  assert.throws(()=>validateRichMediaSelection(r,initial),/No country backgrounds/);
  const html=renderRichMediaReviewHtml(r);
  assert.match(html,/Select all/);
  assert.match(html,/Download reviewed background\/gallery selection JSON/);
  assert.match(html,/object-fit:contain/);
  assert.ok(!html.includes('SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY'));
});
test('selection supports partial independent background and gallery approval',()=>{
  const r=review(),initial=initialRichMediaSelection(r);
  initial.backgrounds[0].selected_path=r.countries.find(c=>c.name==='Aquliateria').backgrounds[0].path;
  initial.gallery.find(c=>c.country_id===r.countries.find(c=>c.name==='Bentagya').id).restore=true;
  const result=validateRichMediaSelection(r,initial);
  assert.equal(result.backgrounds.length,1);
  assert.equal(result.galleries.length,1);
  assert.equal(result.files.length,2);
  assert.equal(result.backgrounds[0].country_name,'Aquliateria');
  assert.equal(result.galleries[0].country_name,'Bentagya');
});
test('a gallery cannot be swapped between countries or mapped to any unapproved path',()=>{
  const r=review(),initial=initialRichMediaSelection(r);
  initial.gallery[0].restore=true;
  const swapped=structuredClone(initial);
  swapped.gallery[0].country_id=r.countries.find(c=>c.name==='Jaudia').id;
  assert.throws(()=>validateRichMediaSelection(r,swapped),/does not belong/);
  const unfamiliar=structuredClone(initial);
  unfamiliar.gallery[0].path='bogus';
  assert.throws(()=>validateRichMediaSelection(r,unfamiliar),/does not belong/);
  const stale=structuredClone(initial);
  stale.manifest_sha256='2'.repeat(64);
  assert.throws(()=>validateRichMediaSelection(r,stale),/pinned original manifest/);
  const duplicates=structuredClone(initial);
  duplicates.gallery[1].path=duplicates.gallery[0].path;
  assert.throws(()=>validateRichMediaSelection(r,duplicates),/Duplicate/);
});
test('the generated SQL preserves original V2 background design properties',()=>{
  const r=review(),draft=initialRichMediaSelection(r);
  draft.backgrounds[0].selected_path=r.countries.find(c=>c.name==='Aquliateria').backgrounds[0].path;
  const approved=validateRichMediaSelection(r,draft);
  const sql=renderCountryRichMediaSql(approved,opts);
  assert.match(sql,/BEGIN;/);
  assert.match(sql,/COMMIT;/);
  assert.match(sql,/FOR UPDATE OF t/);
  assert.match(sql,/t.design_version=2/);
  assert.match(sql,/jsonb_set\(/);
  assert.match(sql,/background,imageStoragePath/);
  assert.match(sql,/v3.legacy_country_background_recovery/);
  assert.match(sql,/read_only/);
  assert.match(sql,/admin_audit_log/);
  assert.match(sql,/source_sha256/);
  assert.match(sql,/Destination owner, path, size or MIME/);
  assert.ok(!sql.includes('UPDATE public.countries'));
  assert.ok(!sql.includes('country_edition_identities'));
});
test('gallery repairs are protected against duplicate rows and audited',()=>{
  const r=review(),draft=initialRichMediaSelection(r);
  draft.gallery[0].restore=true;
  const approved=validateRichMediaSelection(r,draft);
  const sql=renderCountryRichMediaSql(approved,opts);
  assert.match(sql,/INSERT INTO public.country_media/);
  assert.match(sql,/country gallery has existing/i);
  assert.match(sql,/v3.legacy_country_gallery_recovery/);
  assert.match(sql,/NULL::text,NULL::text/);
  assert.match(sql,/source_sha256/);
  assert.ok(!sql.includes('UPDATE public.countries'));
});
test('rejects invalid operator ticket, changed image content and two backgrounds for one country',()=>{
  const r=review(),draft=initialRichMediaSelection(r);
  draft.backgrounds[0].selected_path=r.countries[0].backgrounds[0].path;
  const approved=validateRichMediaSelection(r,draft);
  assert.throws(()=>renderCountryRichMediaSql(approved,{...opts,gitSha:'wrong'}),/scope/);
  assert.throws(()=>renderCountryRichMediaSql(approved,{...opts,ticket:'unapproved'}),/scope/);
  assert.throws(()=>renderCountryRichMediaSql({
    ...approved,backgrounds:[{...approved.backgrounds[0],sha256:'INVALID'}],
    files:[{...approved.files[0],sha256:'INVALID'}],
  },opts),/identity/);
  assert.throws(()=>renderCountryRichMediaSql({
    backgrounds:[approved.backgrounds[0],approved.backgrounds[0]],
    galleries:[],files:[approved.files[0],approved.files[0]],
  },opts),/Duplicate approved media path/);
});
