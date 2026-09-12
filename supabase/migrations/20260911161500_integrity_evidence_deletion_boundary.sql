begin;

-- Private evidence deletion is performed by an authenticated Edge Function after
-- these organizer-only descriptors validate lifecycle state. Browser roles no
-- longer receive storage paths or a generic DELETE policy on the private bucket.
drop policy if exists "integrity evidence organizer delete" on storage.objects;

create or replace function public.admin_integrity_evidence_deletion_descriptor(_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_case_id uuid;
  v_path text;
  v_status text;
  v_retention timestamptz;
  v_exists boolean;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  select e.case_id, e.storage_path, e.lifecycle_status, e.retention_until
  into v_case_id, v_path, v_status, v_retention
  from public.integrity_case_evidence e
  where e.id = _evidence_id
  for update;

  if v_case_id is null then raise exception 'Evidence not found'; end if;
  if v_status <> 'scheduled_for_deletion' then raise exception 'Evidence is not scheduled for deletion'; end if;
  if v_retention is null or v_retention > now() then raise exception 'Evidence retention period has not expired'; end if;

  v_exists := v_path is not null and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'integrity-evidence' and o.name = v_path
  );

  return jsonb_build_object(
    'bucket', 'integrity-evidence',
    'storage_path', v_path,
    'object_exists', v_exists
  );
end;
$$;
revoke all on function public.admin_integrity_evidence_deletion_descriptor(uuid) from public;
grant execute on function public.admin_integrity_evidence_deletion_descriptor(uuid) to authenticated;

create or replace function public.admin_integrity_expired_upload_deletion_descriptor(_token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_path text;
  v_expires timestamptz;
  v_used timestamptz;
  v_exists boolean;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  select t.object_path, t.expires_at, t.used_at
  into v_path, v_expires, v_used
  from public.integrity_evidence_upload_tokens t
  where t.id = _token_id
  for update;

  if v_path is null then raise exception 'Evidence upload token not found'; end if;
  if v_used is not null then raise exception 'Finalised evidence upload tokens cannot be discarded'; end if;
  if v_expires > now() then raise exception 'Evidence upload token has not expired'; end if;

  v_exists := exists (
    select 1 from storage.objects o
    where o.bucket_id = 'integrity-evidence' and o.name = v_path
  );

  return jsonb_build_object(
    'bucket', 'integrity-evidence',
    'storage_path', v_path,
    'object_exists', v_exists
  );
end;
$$;
revoke all on function public.admin_integrity_expired_upload_deletion_descriptor(uuid) from public;
grant execute on function public.admin_integrity_expired_upload_deletion_descriptor(uuid) to authenticated;

-- Operational queues deliberately omit private object locators. The Edge
-- Function resolves them only after lifecycle authorization succeeds.
create or replace function public.admin_integrity_evidence_due_for_deletion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'case_id', e.case_id,
      'case_code', c.public_code,
      'title', e.title,
      'original_name', e.original_name,
      'mime_type', e.mime_type,
      'retention_until', e.retention_until,
      'deletion_reason', e.deletion_reason
    ) order by e.retention_until, e.created_at)
    from public.integrity_case_evidence e
    join public.integrity_cases c on c.id = e.case_id
    where e.lifecycle_status = 'scheduled_for_deletion'
      and e.retention_until <= now()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_evidence_due_for_deletion() from public;
grant execute on function public.admin_integrity_evidence_due_for_deletion() to authenticated;

create or replace function public.admin_integrity_expired_evidence_uploads()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'token_id', t.id,
      'case_id', t.case_id,
      'original_name', t.original_name,
      'expires_at', t.expires_at,
      'object_exists', exists (
        select 1 from storage.objects o
        where o.bucket_id = 'integrity-evidence' and o.name = t.object_path
      )
    ) order by t.expires_at, t.id)
    from public.integrity_evidence_upload_tokens t
    where t.used_at is null
      and t.expires_at <= now()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_expired_evidence_uploads() from public;
grant execute on function public.admin_integrity_expired_evidence_uploads() to authenticated;

commit;
