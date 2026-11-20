/** Pure SQL generator for separately approved country background + gallery references.
 * Never uploads files, executes SQL, or changes legacy flags.
 */
import { ROOT, RECOVERABLE_COUNTRIES } from './v3-country-rich-media-recovery.mjs';
const QUOTE = value => "'" + String(value).replaceAll("'", "''") + "'";
const SHA=/^[0-9a-f]{64}$/;
const PATH=/^[0-9a-f-]{36}\/(backgrounds|gallery)\/[A-Za-z0-9._-]+$/;
const VALID_MIME=new Set(['image/jpeg','image/png','image/webp']);
export function renderCountryRichMediaSql(approved,{gitSha,ticket,ownerLogin='solarissongcontest'}={}) {
  if (!approved || !Array.isArray(approved.backgrounds) || !Array.isArray(approved.galleries) ||
      !approved.files || approved.files.length !== approved.backgrounds.length + approved.galleries.length ||
      approved.files.length < 1 || approved.files.length > 23 ||
      !/^[a-f0-9]{40}$/.test(gitSha||'') ||
      !/^OWNER-RICH-MEDIA-[0-9]{14}$/.test(ticket||'') || ownerLogin !== 'solarissongcontest')
    throw Error('Invalid owner-reviewed rich media SQL scope');
  if (approved.backgrounds.length > 8 || approved.galleries.length > 9)
    throw Error('Invalid background or gallery count');
  const paths=new Set(), countries=new Set();
  const rows=approved.files.map((asset,index)=>{
    if (paths.has(asset.path)) throw Error('Duplicate approved media path');
    paths.add(asset.path);
    const match=RECOVERABLE_COUNTRIES.find(c=>c.id===asset.country_id && c.name===asset.country_name);
    const kind=asset.kind;
    if (!match || !['backgrounds','gallery'].includes(kind) ||
        !PATH.test(asset.path) || !asset.path.startsWith(asset.country_id+'/'+kind+'/') ||
        !SHA.test(asset.sha256||'') || !Number.isSafeInteger(asset.bytes) ||
        asset.bytes<1 || asset.bytes>5*1024*1024 || !VALID_MIME.has(asset.mime))
      throw Error('Invalid approved country-media identity');
    if (kind==='backgrounds') {
      if (countries.has(asset.country_id)) throw Error('Two active backgrounds for the same country');
      countries.add(asset.country_id);
    }
    return '(' + [
      QUOTE(asset.country_id),QUOTE(asset.country_name),QUOTE(kind),QUOTE(asset.path),
      String(asset.bytes),QUOTE(asset.mime),QUOTE(asset.sha256),String(index+1)
    ].join(',') + ')';
  }).join(',\n  ');
  const backgroundCount=approved.backgrounds.length;
  const galleryCount=approved.galleries.length;
  const all=approved.files.length;
  return `-- SOLARIS V3: manually reviewed background / gallery restoration.
-- Generated local-only, verified destination byte SHA-256 against pinned original inventory.
-- Owner: ${ownerLogin}; ticket: ${ticket}; source code SHA: ${gitSha}
-- Only ${backgroundCount} explicitly selected active backgrounds and ${galleryCount} gallery rows.
-- No existing flags, historical identities, existing images, other themes, modes or results modified.
-- IMPORTANT: run ONCE in DESTINATION protected SQL editor after owner reviews this file.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '40s';
DO $solaris_approved_country_rich_media$
DECLARE
  v_mode text;
  v_expected integer;
  v_count integer;
  v_updated integer;
  v_audited integer;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Protected operator required for restored legacy country-media references';
  END IF;
  SELECT mode INTO v_mode FROM public.studio2_platform_operational_state WHERE singleton;
  IF v_mode IS DISTINCT FROM 'read_only' THEN
    RAISE EXCEPTION 'Country media recovery allowed only in current read_only platform mode';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id='country-media') IS DISTINCT FROM true
     OR (SELECT public FROM storage.buckets WHERE id='solaris-upload-quarantine') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Destination Storage bucket privacy changed';
  END IF;
  CREATE TEMP TABLE _approved_rich_media(
    country_id uuid NOT NULL, country_name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('backgrounds','gallery')),
    object_path text PRIMARY KEY, expected_bytes bigint NOT NULL,
    expected_mime text NOT NULL, expected_sha256 text NOT NULL,
    selection_ordinal integer NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _approved_rich_media VALUES
  ${rows};

  SELECT count(*) INTO v_count FROM _approved_rich_media;
  IF v_count <> ${all} THEN RAISE EXCEPTION 'Approved selection count mismatch'; END IF;
  SELECT count(*) INTO v_count
  FROM _approved_rich_media a
  JOIN public.countries c ON c.id=a.country_id AND c.name=a.country_name
  JOIN storage.objects o ON o.bucket_id='country-media' AND o.name=a.object_path
  WHERE a.object_path LIKE c.id::text || '/' || a.kind || '/%'
    AND (o.metadata->>'size')::bigint=a.expected_bytes
    AND (o.metadata->>'mimetype')=a.expected_mime
    AND a.expected_sha256 ~ '^[a-f0-9]{64}$'
    AND a.expected_bytes BETWEEN 1 AND 5242880;
  IF v_count <> ${all} THEN
    RAISE EXCEPTION 'Destination owner, path, size or MIME differs from manually verified inventory';
  END IF;

  PERFORM c.id FROM public.countries c
    JOIN (SELECT DISTINCT country_id FROM _approved_rich_media) a ON a.country_id=c.id
    FOR UPDATE OF c;

  -- Every active background is an explicit owner choice.
  -- Do not reactivate an image if the current V2 theme has since been edited.
  IF ${backgroundCount} > 0 THEN
    PERFORM t.country_id FROM public.country_themes t
      JOIN _approved_rich_media a ON a.country_id=t.country_id AND a.kind='backgrounds'
      FOR UPDATE OF t;
    SELECT count(*) INTO v_count
    FROM public.country_themes t
    JOIN _approved_rich_media a ON a.country_id=t.country_id AND a.kind='backgrounds'
    WHERE t.design_version=2
      AND t.design_v2 IS NOT NULL
      AND jsonb_typeof(t.design_v2->'background')='object'
      AND t.background_mode='gradient'
      AND nullif(btrim(t.background_image_url),'') IS NULL
      AND nullif(btrim(t.background_image_storage_path),'') IS NULL
      AND t.design_v2 #>> '{background,mode}'='gradient'
      AND t.design_v2 #> '{background,imageUrl}'='null'::jsonb
      AND t.design_v2 #> '{background,imageStoragePath}'='null'::jsonb;
    IF v_count <> ${backgroundCount} THEN
      RAISE EXCEPTION 'Country V2 theme drift: refusing background activation';
    END IF;
    CREATE TEMP TABLE _rich_background_before ON COMMIT DROP AS
    SELECT t.country_id,t.background_mode,t.background_image_url,
      t.background_image_storage_path,t.design_v2,t.updated_at
    FROM public.country_themes t
      JOIN _approved_rich_media a ON a.country_id=t.country_id AND a.kind='backgrounds';
    UPDATE public.country_themes t
      SET background_mode='image',
        background_image_url=${QUOTE(ROOT)} || a.object_path,
        background_image_storage_path=a.object_path,
        design_v2=jsonb_set(
          jsonb_set(
            jsonb_set(t.design_v2,'{background,mode}',to_jsonb('image'::text),true),
            '{background,imageUrl}',to_jsonb(${QUOTE(ROOT)} || a.object_path),true),
          '{background,imageStoragePath}',to_jsonb(a.object_path),true),
        updated_at=now()
    FROM _approved_rich_media a
    WHERE a.kind='backgrounds' AND a.country_id=t.country_id;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated <> ${backgroundCount} THEN
      RAISE EXCEPTION 'Background update count mismatch; rolling back';
    END IF;
    INSERT INTO public.admin_audit_log
      (actor_id,action,table_name,record_id,country_id,before_data,after_data)
    SELECT NULL::uuid,'v3.legacy_country_background_recovery',
      'country_themes',t.country_id::text,t.country_id,
      jsonb_build_object('background_mode',b.background_mode,
        'background_image_url',b.background_image_url,
        'background_image_storage_path',b.background_image_storage_path,
        'design_v2',b.design_v2,'updated_at',b.updated_at),
      jsonb_build_object('background_mode',t.background_mode,
        'background_image_url',t.background_image_url,
        'background_image_storage_path',t.background_image_storage_path,
        'design_v2',t.design_v2,'updated_at',t.updated_at,
        'source_sha256',a.expected_sha256,'source_path',a.object_path,
        'change_ticket',${QUOTE(ticket)},'owner',${QUOTE(ownerLogin)},
        'source_git_sha',${QUOTE(gitSha)},
        'evidence','owner selection plus live SHA-256 byte readback')
    FROM _rich_background_before b
    JOIN public.country_themes t ON t.country_id=b.country_id
    JOIN _approved_rich_media a ON a.country_id=t.country_id AND a.kind='backgrounds';
    GET DIAGNOSTICS v_audited=ROW_COUNT;
    IF v_audited <> ${backgroundCount} THEN
      RAISE EXCEPTION 'Incomplete background audit; rolling back';
    END IF;
  END IF;

  -- Restored gallery items are individually approved, with no guessed caption.
  -- Fail closed if another gallery batch has already restored anything for these countries.
  IF ${galleryCount} > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.country_media m
      WHERE m.country_id IN (
        SELECT DISTINCT country_id FROM _approved_rich_media WHERE kind='gallery')
    ) THEN
      RAISE EXCEPTION 'Country gallery has existing records: refuse overwrite or duplicate recovery';
    END IF;
    INSERT INTO public.country_media
      (country_id,storage_path,public_url,caption,alt_text,sort_order)
    SELECT a.country_id,a.object_path,${QUOTE(ROOT)} || a.object_path,
      NULL::text,NULL::text,
      (row_number() OVER (PARTITION BY a.country_id ORDER BY a.selection_ordinal)-1)::integer
    FROM _approved_rich_media a WHERE a.kind='gallery';
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated <> ${galleryCount} THEN
      RAISE EXCEPTION 'Gallery insertion count mismatch; rolling back';
    END IF;
    INSERT INTO public.admin_audit_log
      (actor_id,action,table_name,record_id,country_id,before_data,after_data)
    SELECT NULL::uuid,'v3.legacy_country_gallery_recovery',
      'country_media',m.id::text,m.country_id,NULL::jsonb,
      jsonb_build_object('storage_path',m.storage_path,
        'public_url',m.public_url,'sort_order',m.sort_order,
        'source_sha256',a.expected_sha256,'source_bytes',a.expected_bytes,
        'change_ticket',${QUOTE(ticket)},'owner',${QUOTE(ownerLogin)},
        'source_git_sha',${QUOTE(gitSha)},
        'evidence','owner selection plus live SHA-256 byte readback')
    FROM public.country_media m
    JOIN _approved_rich_media a ON a.object_path=m.storage_path AND a.kind='gallery';
    GET DIAGNOSTICS v_audited=ROW_COUNT;
    IF v_audited <> ${galleryCount} THEN
      RAISE EXCEPTION 'Incomplete gallery audit; rolling back';
    END IF;
  END IF;
END
$solaris_approved_country_rich_media$;
COMMIT;

-- AFTER COMMIT: read-only verification queries.
SELECT c.name,t.background_mode,t.background_image_storage_path,t.design_v2->'background' AS v2_background
FROM public.country_themes t JOIN public.countries c ON c.id=t.country_id
WHERE c.id::text IN (${approved.backgrounds.length ? approved.backgrounds.map(x=>QUOTE(x.country_id)).join(',') : QUOTE('00000000-0000-0000-0000-000000000000')})
ORDER BY c.name;

SELECT c.name,m.storage_path,m.public_url,m.sort_order
FROM public.country_media m JOIN public.countries c ON c.id=m.country_id
WHERE c.id::text IN (${approved.galleries.length ? [...new Set(approved.galleries.map(x=>x.country_id))].map(QUOTE).join(',') : QUOTE('00000000-0000-0000-0000-000000000000')})
ORDER BY c.name,m.sort_order;
`;
}
