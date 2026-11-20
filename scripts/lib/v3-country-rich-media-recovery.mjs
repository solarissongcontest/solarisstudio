/** Solaris V3 manual country background/gallery reference recovery.
 * Pure functions only. Does not access live Supabase or write any database.
 */
import { stagedDigest } from './v3-staged-media-recovery.mjs';

export const PROJECT = 'dkxmnvekiopyesuzggeu';
export const ROOT = 'https://' + PROJECT + '.supabase.co/storage/v1/object/public/country-media/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^[a-f0-9-]{36}\/(backgrounds|gallery)\/[a-zA-Z0-9._-]+$/;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const htmlEscape = value => String(value).replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));

export const RECOVERABLE_COUNTRIES = Object.freeze([
  { id:'48a7ac11-497c-47f2-a354-9a8a715ebdcd', name:'Aquliateria' },
  { id:'593112c7-c081-4c97-9392-1d6d52713b32', name:'Bentagya' },
  { id:'e57d2ff7-66c7-4b53-ae3f-a80f887e3950', name:'Diaria' },
  { id:'34078189-5be2-4370-8dfd-c9d4b498a6a6', name:'Jaudia' },
  { id:'652a67e3-cb31-42dc-bb0f-3ee77637bc26', name:'Linem' },
  { id:'5b3a11fd-e675-4811-930c-33bbab52ad97', name:'Oland' },
  { id:'98efa936-c8db-4959-ab25-f929a2f570ad', name:'Temia' },
  { id:'b1d6f522-27d8-4236-b4e5-2ca85459aeb4', name:'Vendia' },
  { id:'e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb', name:'Yaria' },
  { id:'b2772416-abe2-4134-bd2f-d58eb132dc0c', name:'Zarzad' },
]);

export function buildRichMediaReview(files) {
  const all = files.filter(file => file.bucket === 'country-media' &&
    ['backgrounds', 'gallery'].includes(file.path.split('/')[1]));
  if (all.length !== 24) throw Error('Unexpected background/gallery inventory');
  const publicFiles = all.filter(file => file.size <= 5 * 1024 * 1024);
  const excluded = all.filter(file => file.size > 5 * 1024 * 1024);
  if (publicFiles.length !== 23 || excluded.length !== 1 ||
      excluded[0].owner !== 'e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb' ||
      excluded[0].path.split('/')[1] !== 'gallery')
    throw Error('Unexpected published/excluded media inventory');
  const byId = new Map(RECOVERABLE_COUNTRIES.map(country => [country.id, country.name]));
  for (const file of publicFiles) {
    const kind = file.path.split('/')[1];
    if (!UUID.test(file.owner) || !byId.has(file.owner) ||
        !SAFE_PATH.test(file.path) || !file.path.startsWith(file.owner + '/' + kind + '/') ||
        !Number.isSafeInteger(file.size) || file.size < 1 || !SHA.test(file.sha256) ||
        !MIME.has(file.mime))
      throw Error('Unsafe original country media asset identity');
  }
  const countries = RECOVERABLE_COUNTRIES.map(country => {
    const items = publicFiles.filter(file => file.owner === country.id)
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(file => ({
        kind: file.path.split('/')[1], path: file.path, mime: file.mime,
        bytes: file.size, sha256: file.sha256, url: ROOT + file.path,
      }));
    return { ...country, backgrounds: items.filter(item => item.kind === 'backgrounds'),
      gallery: items.filter(item => item.kind === 'gallery') };
  }).filter(country => country.backgrounds.length || country.gallery.length);
  if (countries.length !== 10 ||
      countries.reduce((n,c) => n+c.backgrounds.length,0) !== 14 ||
      countries.reduce((n,c) => n+c.gallery.length,0) !== 9)
    throw Error('Unexpected country media ownership');
  return {
    report_type:'v3-country-rich-media-owner-review',
    destination_project:PROJECT,
    manifest_sha256:stagedDigest(files),
    oversized_original_excluded:true,
    countries,
  };
}
export function initialRichMediaSelection(review) {
  return {
    report_type:'v3-country-rich-media-owner-selection',
    destination_project:review.destination_project,
    manifest_sha256:review.manifest_sha256,
    backgrounds:review.countries.filter(country => country.backgrounds.length)
      .map(country => ({ country_id:country.id, selected_path:null })),
    gallery:review.countries.flatMap(country => country.gallery.map(item =>
      ({country_id:country.id,path:item.path,restore:false}))),
  };
}
export function validateRichMediaSelection(review, selection) {
  const expected = initialRichMediaSelection(review);
  if (selection?.report_type !== expected.report_type ||
      selection.destination_project !== expected.destination_project ||
      selection.manifest_sha256 !== expected.manifest_sha256 ||
      !Array.isArray(selection.backgrounds) || !Array.isArray(selection.gallery) ||
      selection.backgrounds.length !== expected.backgrounds.length ||
      selection.gallery.length !== expected.gallery.length)
    throw Error('Media selection does not match the pinned original manifest');
  const backgrounds = [];
  const bgSeen = new Set();
  for (const row of selection.backgrounds) {
    if (!row || typeof row.country_id !== 'string' || bgSeen.has(row.country_id))
      throw Error('Duplicate or invalid background selection');
    bgSeen.add(row.country_id);
    const country = review.countries.find(c => c.id === row.country_id && c.backgrounds.length);
    if (!country || !(row.selected_path === null || typeof row.selected_path === 'string'))
      throw Error('Unknown background country or selection');
    if (row.selected_path !== null) {
      const candidate = country.backgrounds.find(item => item.path === row.selected_path);
      if (!candidate) throw Error('Background does not belong to canonical country');
      backgrounds.push({...candidate, country_id:country.id, country_name:country.name});
    }
  }
  if (expected.backgrounds.some(row => !bgSeen.has(row.country_id)))
    throw Error('Missing required background country selection');
  const galleries = [];
  const gallerySeen = new Set();
  for (const row of selection.gallery) {
    if (!row || typeof row.path !== 'string' || gallerySeen.has(row.path) ||
        typeof row.restore !== 'boolean')
      throw Error('Duplicate or invalid gallery selection');
    gallerySeen.add(row.path);
    const country = review.countries.find(c => c.id === row.country_id && c.gallery.length);
    const candidate = country?.gallery.find(item => item.path === row.path);
    if (!candidate) throw Error('Gallery file does not belong to canonical country');
    if (row.restore) galleries.push({...candidate,country_id:country.id,country_name:country.name});
  }
  if (expected.gallery.some(row => !gallerySeen.has(row.path)))
    throw Error('Missing required gallery candidate');
  if (!backgrounds.length && !galleries.length)
    throw Error('No country backgrounds or gallery images approved');
  return {backgrounds,galleries,files:[...backgrounds,...galleries]};
}
export function renderRichMediaReviewHtml(review) {
  const state = JSON.stringify(initialRichMediaSelection(review)).replace(/</g, '\\u003c');
  const card = (asset,kind,countryId) =>
    '<button type="button" class="image-option" data-kind="' + kind +
    '" data-country="' + htmlEscape(countryId) + '" data-path="' +
    htmlEscape(asset.path) + '" aria-pressed="false">' +
    '<img loading="lazy" src="' + htmlEscape(asset.url) + '" alt="' +
    htmlEscape(kind + ' candidate') + '"><small>' +
    htmlEscape(asset.path.split('/').at(-1)) + '</small><small>' +
    htmlEscape((asset.bytes / 1024).toFixed(1)) + ' KB · SHA-256 ' +
    htmlEscape(asset.sha256.slice(0,16)) + '…</small></button>';
  const blocks = review.countries.map(country =>
    '<section><h2>' + htmlEscape(country.name) + '</h2>' +
    (country.backgrounds.length ? '<h3>Active background · select one or none</h3><div class="options">' +
      country.backgrounds.map(item => card(item,'background',country.id)).join('') +
      '</div><button type="button" class="clear" data-clear="' + htmlEscape(country.id) +
      '">Keep existing gradient, no background change</button>' : '') +
    (country.gallery.length ? '<h3>Gallery · select each image to restore</h3><div class="options">' +
      country.gallery.map(item => card(item,'gallery',country.id)).join('') +
      '</div><button type="button" class="select-gallery" data-select-all="' +
      htmlEscape(country.id) + '">Select all ' + country.gallery.length + ' gallery images</button>' : '') +
    '</section>').join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Solaris V3 · Restore backgrounds and galleries</title>
  <style>*,*:before,*:after{box-sizing:border-box}body{background:#101722;color:#ecf0f8;font:15px/1.5 system-ui;margin:0}
  main{max-width:1240px;margin:auto;padding:26px}h1{font-size:clamp(24px,4vw,38px)}h2{margin:0}h3{font-size:16px;color:#d5e6f3}
  p{color:#bfd0de}section{padding:26px 0;border-top:1px solid #42516a}.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
  button{cursor:pointer;color:#e8f0f7;background:#23344b;border:1px solid #718296;border-radius:10px;padding:12px}
  .image-option{display:flex;flex-direction:column;align-items:stretch;gap:6px;border:2px solid #425675;text-align:left;min-width:0}
  .image-option[aria-pressed=true]{border-color:#63dfb2;box-shadow:0 0 0 2px #63dfb233}
  .image-option img{width:100%;height:170px;object-fit:contain;background:#304358}
  .image-option small{font-size:11px;overflow-wrap:anywhere;color:#bfcede}
  .clear,.select-gallery{margin-top:12px}
  #download{position:sticky;bottom:10px;background:#236d56;border:2px solid #8fefc0;font-weight:750}
  #count{color:#8fefc0;font-weight:750}</style>
  <main><h1>Solaris · Recovered backgrounds and galleries</h1>
  <p>Only the original 23 public files appear here. Select one active background per country or leave the current gradient. Select the gallery images to restore. The oversized Yaria image remains private. Nothing is written to the database by selecting or downloading.</p>
  <p id="count">0 selected</p>${blocks}
  <button type="button" id="download">Download reviewed background/gallery selection JSON</button>
  <p>Review the selection and upload the JSON to your private Codespaces home directory. Do not commit it or any credentials to Git.</p>
  </main>
  <script id="selection" type="application/json">${state}</script>
  <script>
  const selection=JSON.parse(document.getElementById('selection').textContent);
  const bg=new Map(selection.backgrounds.map(x=>[x.country_id,x]));
  const gallery=new Map(selection.gallery.map(x=>[x.path,x]));
  function redraw(){
    document.querySelectorAll('.image-option').forEach(b=>{
      const selected=b.dataset.kind==='background'
        ? bg.get(b.dataset.country)?.selected_path===b.dataset.path
        : gallery.get(b.dataset.path)?.restore===true;
      b.setAttribute('aria-pressed',String(selected));
    });
    const nb=selection.backgrounds.filter(x=>x.selected_path).length;
    const ng=selection.gallery.filter(x=>x.restore).length;
    document.getElementById('count').textContent=nb+' active backgrounds · '+ng+' gallery images selected';
  }
  document.querySelectorAll('.image-option').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.kind==='background') bg.get(b.dataset.country).selected_path=b.dataset.path;
    else gallery.get(b.dataset.path).restore=!gallery.get(b.dataset.path).restore;
    redraw();
  }));
  document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{
    bg.get(b.dataset.clear).selected_path=null;redraw();
  }));
  document.querySelectorAll('[data-select-all]').forEach(b=>b.addEventListener('click',()=>{
    selection.gallery.filter(x=>x.country_id===b.dataset.selectAll).forEach(x=>x.restore=true);
    redraw();
  }));
  document.getElementById('download').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(selection,null,2)+'\\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='solaris-country-rich-media-selection.json';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  redraw();
  </script></html>`;
}
