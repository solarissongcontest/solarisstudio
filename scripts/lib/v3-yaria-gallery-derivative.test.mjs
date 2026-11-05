import test from 'node:test';
import assert from 'node:assert/strict';
import {YARIA,validateYariaMedia,validateYariaManifest,renderYariaGalleryReferenceSql} from './v3-yaria-gallery-derivative.mjs';
test('requires exact pinned original inventory metadata',()=>{
 const original={bucket:'country-media',owner:YARIA.country_id,
  path:YARIA.original_path.slice('country-media/'.length),
  size:YARIA.original_bytes,mime:'image/jpeg',sha256:YARIA.original_sha256};
 assert.equal(validateYariaManifest([original]).path,original.path);
 assert.throws(()=>validateYariaManifest([{...original,sha256:'f'.repeat(64)}]),/pinned/);
 assert.throws(()=>validateYariaManifest([]),/pinned/);
});
test('rejects substituted or truncated bytes before any upload',()=>{
 const fake=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(YARIA.candidate_bytes-3)]);
 assert.throws(()=>validateYariaMedia(fake),/Optimized Yaria JPEG/);
 assert.throws(()=>validateYariaMedia(Buffer.from('hello')),/Optimized Yaria JPEG/);
 assert.throws(()=>validateYariaMedia(fake,{original:true}),/Original private Yaria JPEG/);
});
test('guarded Yaria SQL requires owner scope and only inserts a new photo reference',()=>{
 const sql=renderYariaGalleryReferenceSql({
  ticket:'OWNER-YARIA-20261105200000',gitSha:'a'.repeat(40)});
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/read_only/);
 assert.match(sql,/solaris-upload-quarantine/);
 assert.match(sql,/v3.legacy_yaria_optimized_gallery_recovery/);
 assert.match(sql,/admin_audit_log/);
 assert.match(sql,/source_original_sha256/);
 assert.match(sql,/public_derivative_sha256/);
 assert.match(sql,/INSERT INTO public.country_media/);
 assert.match(sql,/storage_path=/);
 assert.ok(!sql.includes('UPDATE public.countries'));
 assert.ok(!sql.includes('UPDATE public.country_themes'));
 assert.ok(!sql.includes('UPDATE public.country_edition_identities'));
 assert.ok(!sql.includes('DELETE FROM storage.objects'));
});
test('cannot generate Yaria live reference SQL with forged ticket or unverified identity',()=>{
 assert.throws(()=>renderYariaGalleryReferenceSql({
  ticket:'OWNER-YARIA-fake',gitSha:'a'.repeat(40)}),/authorization/);
 assert.throws(()=>renderYariaGalleryReferenceSql({
  ticket:'OWNER-YARIA-20261105200000',gitSha:'wrong'}),/authorization/);
 assert.throws(()=>renderYariaGalleryReferenceSql({
  ticket:'OWNER-YARIA-20261105200000',gitSha:'a'.repeat(40),
  ownerLogin:'other'}),/authorization/);
});
