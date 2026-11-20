/** Pure gates and guarded SQL for the separately verified oversized Yaria gallery derivative.
 * Original private asset is never overwritten, published, deleted or linked.
 */
import {sha256,detectMime} from './v3-media-recovery-core.mjs';
export const YARIA={
 country_id:'e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb',
 country_name:'Yaria',
 original_bucket:'solaris-upload-quarantine',
 original_path:'country-media/e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb/gallery/4e808357-8975-4535-af5c-9eb0646598a9-img_6209.jpeg',
 original_sha256:'c9acea728aa70feaa60ce1693d4d0251772debc9f40a57f7979b84ca970fe028',
 original_bytes:5679181,
 candidate_sha256:'5db557d0f713442570fd6a5a7466ea593ecc3a3e493c6f3f17c8f2ac5188ee0b',
 candidate_bytes:5107168,
 candidate_name:'img_6209-v3-5mib-candidate.jpeg',
 destination_bucket:'country-media',
 destination_path:'e38e88bf-0d17-4eae-9e7e-7b27acf6f4eb/gallery/yaria-img_6209-recovered-optimized-v3-5db557d0f713.jpeg',
};
const Q=x=>"'"+String(x).replaceAll("'","''")+"'";
export function validateYariaMedia(bytes,{original=false}={}){
 const value=Buffer.from(bytes);
 const actual=sha256(value);
 const expectedSha=original?YARIA.original_sha256:YARIA.candidate_sha256;
 const expectedBytes=original?YARIA.original_bytes:YARIA.candidate_bytes;
 if(value.length!==expectedBytes||actual!==expectedSha||detectMime(value)!=='image/jpeg')
  throw Error(original?'Original private Yaria JPEG does not match pinned legacy bytes':'Optimized Yaria JPEG does not match reviewed candidate');
 return {bytes:value.length,sha256:actual,mime:'image/jpeg'};
}
export function validateYariaManifest(files){
 const f=files.find(x=>x.bucket==='country-media'&&x.path===YARIA.original_path.slice('country-media/'.length));
 if(!f||f.size!==YARIA.original_bytes||f.sha256!==YARIA.original_sha256||
   f.mime!=='image/jpeg'||f.owner!==YARIA.country_id)
  throw Error('Oversized Yaria original does not match pinned legacy manifest');
 return f;
}
export function renderYariaGalleryReferenceSql({ticket,gitSha,ownerLogin='solarissongcontest'}={}){
 if(!/^OWNER-YARIA-[0-9]{14}$/.test(ticket||'')||
  !/^[a-f0-9]{40}$/.test(gitSha||'')||ownerLogin!=='solarissongcontest')
  throw Error('Invalid Yaria derivative reference authorization');
 const url='https://dkxmnvekiopyesuzggeu.supabase.co/storage/v1/object/public/country-media/'+YARIA.destination_path;
 return `-- Owner-approved optimized Yaria PHOTO, NOT the original private file.
-- Change ticket: ${ticket}; repository owner ${ownerLogin}; exact recovery head ${gitSha}
-- The original SHA-256 ${YARIA.original_sha256} remains private and unchanged.
-- Optimized public bytes SHA-256: ${YARIA.candidate_sha256}. Image 5184x3456.
-- Authenticated owner has manually checked visual fidelity and public asset path.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25s';
DO $restore_verified_yaria_photo$
DECLARE v_mode text; v_count integer; v_id uuid;
BEGIN
 IF session_user NOT IN ('postgres','supabase_admin') THEN
  RAISE EXCEPTION 'Protected Yaria gallery recovery operator required';
 END IF;
 SELECT mode INTO v_mode FROM public.studio2_platform_operational_state WHERE singleton;
 IF v_mode IS DISTINCT FROM 'read_only' THEN
  RAISE EXCEPTION 'Yaria recovery requires unchanged read_only platform mode';
 END IF;
 IF (SELECT public FROM storage.buckets WHERE id='country-media') IS DISTINCT FROM true
    OR (SELECT public FROM storage.buckets WHERE id='solaris-upload-quarantine') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Storage bucket privacy changed';
 END IF;
 PERFORM id FROM public.countries WHERE id=${Q(YARIA.country_id)}::uuid
  AND name=${Q(YARIA.country_name)} FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Canonical country Yaria is unavailable'; END IF;
 SELECT count(*) INTO v_count
 FROM storage.objects o WHERE o.bucket_id='country-media'
  AND o.name=${Q(YARIA.destination_path)}
  AND (o.metadata->>'size')::bigint=${YARIA.candidate_bytes}
  AND (o.metadata->>'mimetype')='image/jpeg';
 IF v_count<>1 THEN RAISE EXCEPTION 'Verified optimized public Yaria photo not staged'; END IF;
 SELECT count(*) INTO v_count FROM storage.objects o
 WHERE o.bucket_id='solaris-upload-quarantine'
  AND o.name=${Q(YARIA.original_path)}
  AND (o.metadata->>'size')::bigint=${YARIA.original_bytes};
 IF v_count<>1 THEN RAISE EXCEPTION 'Original private Yaria photo is missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.country_media
    WHERE storage_path=${Q(YARIA.destination_path)}
      OR public_url=${Q(url)})
 THEN RAISE EXCEPTION 'Yaria photo already referenced, refusing duplicate'; END IF;
 INSERT INTO public.country_media(country_id,storage_path,public_url,caption,alt_text,sort_order)
 VALUES (${Q(YARIA.country_id)}::uuid,${Q(YARIA.destination_path)},${Q(url)},
   NULL,NULL,
   (SELECT coalesce(max(sort_order),-1)+1 FROM public.country_media
    WHERE country_id=${Q(YARIA.country_id)}::uuid))
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Failed to add optimized gallery reference'; END IF;
 INSERT INTO public.admin_audit_log
  (actor_id,action,table_name,record_id,country_id,before_data,after_data)
 VALUES (
  NULL::uuid,'v3.legacy_yaria_optimized_gallery_recovery','country_media',v_id::text,
  ${Q(YARIA.country_id)}::uuid,NULL::jsonb,
  jsonb_build_object('storage_path',${Q(YARIA.destination_path)},
   'public_url',${Q(url)},'source_original_sha256',${Q(YARIA.original_sha256)},
   'public_derivative_sha256',${Q(YARIA.candidate_sha256)},
   'derivative_bytes',${YARIA.candidate_bytes},
   'change_ticket',${Q(ticket)},'owner',${Q(ownerLogin)},
   'source_git_sha',${Q(gitSha)},'evidence',
   'operator-verified original private SHA-256 and published optimized public readback')
 );
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1 THEN RAISE EXCEPTION 'Yaria photo audit failed, rolling back'; END IF;
END
$restore_verified_yaria_photo$;
COMMIT;
SELECT c.name,m.storage_path,m.public_url,m.sort_order
 FROM public.country_media m JOIN public.countries c ON c.id=m.country_id
 WHERE m.storage_path=${Q(YARIA.destination_path)};
`;
}
