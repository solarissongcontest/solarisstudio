-- MANUAL, POST-STORAGE PROMOTION ONLY. DOES NOT COPY OBJECTS.
-- Do NOT run in CI or before an authorized operator has independently SHA-256
-- verified each source and destination Storage object. Original 7 hashes below
-- are from independently checked legacy-public-media.zip, NOT from V3 metadata.
-- This operation changes only 7 already-published editions with blank artwork,
-- retains platform read_only and leaves Confirmation permissions unchanged.
BEGIN;
DO $migration$
DECLARE
  n integer;
  changed integer;
  v_mode text;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Manual restore requires a protected database operator';
  END IF;
  SELECT mode INTO v_mode FROM public.studio2_platform_operational_state WHERE singleton;
  IF v_mode IS NULL OR v_mode = 'maintenance' THEN
    RAISE EXCEPTION 'Refusing artwork repair in unknown/full-maintenance mode';
  END IF;
  CREATE TEMP TABLE _v3_edition_artwork_recovery (
    edition_id uuid PRIMARY KEY,
    object_path text UNIQUE NOT NULL,
    expected_bytes bigint NOT NULL,
    expected_sha256 text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _v3_edition_artwork_recovery VALUES
    ('00016892-b26f-4e02-aae2-7e83a34a3cf2'::uuid,'00016892-b26f-4e02-aae2-7e83a34a3cf2/1787149841114-6547c1dd-1968-473d-9531-fa27fc22c2e8.jpeg',1796484::bigint,'406bc51d8e366b2f100d80d01d6d31a3513622c70da131e7b7019d19b82b2dab'),
    ('1a4c595f-2816-4d34-a728-96a1110e3037'::uuid,'1a4c595f-2816-4d34-a728-96a1110e3037/1787390475775-94fc5377-1b67-4ec7-848b-bd16fc5607e3.jpeg',1510309::bigint,'e846b4ede93ab45a83c9f3447989e145fb1a6a8dc730375e2c4227a0a5edbc73'),
    ('3d9cdfa5-0a38-4076-a6ef-69344a2aa609'::uuid,'3d9cdfa5-0a38-4076-a6ef-69344a2aa609/1787064381516-99b55ab7-05a1-4fb7-ab77-4392c48cc63c.jpeg',393608::bigint,'150cd32951050f4ec9d1d345bca2041673f0e4ae8779ddb573e4e0fd09523a05'),
    ('512f8650-ecf9-4037-ac09-c396d9a3cfd0'::uuid,'512f8650-ecf9-4037-ac09-c396d9a3cfd0/1787403576192-14f4c2d8-2992-4082-8435-487a4e374a81.jpeg',57923::bigint,'44fd2f682bff7e0afb1588ae3034fac3bbda3e5e5ca40a6dfa438f1e50bc81ea'),
    ('981966c4-5bac-4b6f-93fd-9ed0cf5ed4f6'::uuid,'981966c4-5bac-4b6f-93fd-9ed0cf5ed4f6/1787402873109-b6b4c33f-1efd-46e7-a36b-8f69ca78d44b.jpeg',88149::bigint,'46c7ca821808a130f1d936582a9485a0788042eba4af342a349dd8f03a66196e'),
    ('bfd14152-5411-4865-a6de-5cee14371ef4'::uuid,'bfd14152-5411-4865-a6de-5cee14371ef4/1787404399659-ae157435-417d-43fa-87b4-ca8a5b38ffb6.jpeg',486843::bigint,'698f01d9d1a31397455a4edc682a1ba1e252d8264bc130aa9875bc56b6e99655'),
    ('c9c7c536-9276-431b-9c42-c619c7a1a642'::uuid,'c9c7c536-9276-431b-9c42-c619c7a1a642/1787402648490-5113e4dd-7053-4309-b692-f8587c6f30c0.jpeg',1073707::bigint,'4c04ee3efa2650eabfeb60807c491504441c7e9495e3db40b3b422c91c9c72db');
  IF (SELECT COUNT(*) FROM _v3_edition_artwork_recovery) <> 7 THEN
    RAISE EXCEPTION 'Expected exact seven-edition recovery set';
  END IF;
  -- Presence, destination bucket, size, MIME, and all existing row fields
  -- must be exactly the reviewed expectations. SHA-256 is separately checked
  -- through Supabase Storage byte readback before operator execution.
  SELECT COUNT(*) INTO n
  FROM _v3_edition_artwork_recovery t
  JOIN public.editions e ON e.id = t.edition_id
  JOIN storage.objects o ON o.bucket_id = 'edition-artwork' AND o.name = t.object_path
  WHERE e.published IS TRUE
    AND COALESCE(btrim(e.logo),'') = ''
    AND COALESCE(btrim(e.artwork_url),'') = ''
    AND COALESCE(btrim(e.artwork_storage_path),'') = ''
    AND (o.metadata->>'size')::bigint = t.expected_bytes
    AND o.metadata->>'mimetype' = 'image/jpeg'
    AND t.expected_sha256 ~ '^[a-f0-9]{64}$';
  IF n <> 7 THEN
    RAISE EXCEPTION 'Ineligible missing/colliding edition artwork; no references changed';
  END IF;

  CREATE TEMP TABLE _v3_artwork_before ON COMMIT DROP AS
    SELECT e.id, e.edition_number, e.logo, e.artwork_url,
      e.artwork_storage_path, e.data_revision, t.expected_sha256
    FROM public.editions e JOIN _v3_edition_artwork_recovery t ON t.edition_id = e.id;

  UPDATE public.editions e
  SET
    artwork_storage_path = t.object_path,
    artwork_url = 'https://dkxmnvekiopyesuzggeu.supabase.co/storage/v1/object/public/edition-artwork/' || t.object_path,
    logo = 'https://dkxmnvekiopyesuzggeu.supabase.co/storage/v1/object/public/edition-artwork/' || t.object_path,
    data_revision = e.data_revision + 1
  FROM _v3_edition_artwork_recovery t
  WHERE e.id = t.edition_id
    AND e.published IS TRUE
    AND COALESCE(btrim(e.logo),'') = ''
    AND COALESCE(btrim(e.artwork_url),'') = ''
    AND COALESCE(btrim(e.artwork_storage_path),'') = '';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 7 THEN
    RAISE EXCEPTION 'Concurrent edition change; rollback all seven';
  END IF;

  INSERT INTO public.admin_audit_log (actor_id,action,table_name,record_id,edition_id,before_data,after_data)
  SELECT NULL::uuid,'v3.legacy_artwork_recovery','editions',
    b.id::text,b.id,
    jsonb_build_object('logo',b.logo,'artwork_url',b.artwork_url,
      'artwork_storage_path',b.artwork_storage_path,'data_revision',b.data_revision),
    jsonb_build_object('logo',e.logo,'artwork_url',e.artwork_url,
      'artwork_storage_path',e.artwork_storage_path,'data_revision',e.data_revision,
      'original_sha256',b.expected_sha256,
      'evidence','operator-verified-storage-readback')
  FROM _v3_artwork_before b JOIN public.editions e ON e.id=b.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 7 THEN
    RAISE EXCEPTION 'Audit incomplete; rollback all seven';
  END IF;
END
$migration$;
COMMIT;
-- Read-only post-check: SELECT edition_number, artwork_url
-- FROM public.editions WHERE edition_number BETWEEN 16 AND 22;
