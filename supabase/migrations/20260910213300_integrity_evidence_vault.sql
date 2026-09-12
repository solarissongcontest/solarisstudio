begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'integrity-evidence',
  'integrity-evidence',
  false,
  15728640,
  array['image/png','image/jpeg','image/webp','application/pdf','text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.integrity_case_id_from_object_path(_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare v_part text;
begin
  v_part := split_part(coalesce(_name, ''), '/', 2);
  begin
    return v_part::uuid;
  exception when others then
    return null;
  end;
end;
$$;
revoke all on function public.integrity_case_id_from_object_path(text) from public;

create or replace function public.integrity_can_upload_evidence(_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.integrity_is_organizer()
    or exists (
      select 1 from public.integrity_evidence_upload_tokens t
      where t.object_path = _name
        and t.expires_at > now()
        and t.used_at is null
    );
$$;
revoke all on function public.integrity_can_upload_evidence(text) from public;
grant execute on function public.integrity_can_upload_evidence(text) to anon, authenticated;

create or replace function public.integrity_can_read_evidence_object(_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.integrity_is_organizer()
    or exists (
      select 1 from public.integrity_cases c
      where c.id = public.integrity_case_id_from_object_path(_name)
        and c.reporter_user_id = auth.uid()
    );
$$;
revoke all on function public.integrity_can_read_evidence_object(text) from public;
grant execute on function public.integrity_can_read_evidence_object(text) to authenticated;

drop policy if exists "integrity evidence token upload" on storage.objects;
create policy "integrity evidence token upload"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'integrity-evidence' and public.integrity_can_upload_evidence(name));

drop policy if exists "integrity evidence protected read" on storage.objects;
create policy "integrity evidence protected read"
on storage.objects for select to authenticated
using (bucket_id = 'integrity-evidence' and public.integrity_can_read_evidence_object(name));

drop policy if exists "integrity evidence organizer delete" on storage.objects;
create policy "integrity evidence organizer delete"
on storage.objects for delete to authenticated
using (bucket_id = 'integrity-evidence' and public.integrity_is_organizer());

create or replace function public.integrity_validate_evidence_file(_name text, _mime text, _size bigint)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if char_length(trim(coalesce(_name, ''))) < 1 or char_length(_name) > 180 then raise exception 'Invalid file name'; end if;
  if _mime not in ('image/png','image/jpeg','image/webp','application/pdf','text/plain') then raise exception 'Unsupported evidence file type'; end if;
  if _size <= 0 or _size > 15728640 then raise exception 'Evidence files must be 15 MB or smaller'; end if;
end;
$$;
revoke all on function public.integrity_validate_evidence_file(text, text, bigint) from public;

create or replace function public.public_create_anonymous_evidence_upload(_case_code text, _recovery_key text, _name text, _mime text, _size bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_case uuid; v_hash text; v_token uuid; v_path text; v_safe text;
begin
  perform public.integrity_validate_evidence_file(_name, _mime, _size);
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.id into v_case
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(_case_code))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash;
  if v_case is null then raise exception 'Case code or recovery key is incorrect'; end if;

  v_safe := regexp_replace(_name, '[^A-Za-z0-9._-]+', '-', 'g');
  v_path := 'case/' || v_case::text || '/reporter/' || encode(extensions.gen_random_bytes(10), 'hex') || '-' || v_safe;
  insert into public.integrity_evidence_upload_tokens(case_id, object_path, original_name, mime_type, expected_size)
  values (v_case, v_path, _name, _mime, _size)
  returning id into v_token;

  return jsonb_build_object('token_id', v_token, 'object_path', v_path, 'bucket', 'integrity-evidence');
end;
$$;
revoke all on function public.public_create_anonymous_evidence_upload(text, text, text, text, bigint) from public;
grant execute on function public.public_create_anonymous_evidence_upload(text, text, text, text, bigint) to anon, authenticated;

create or replace function public.create_protected_evidence_upload(_case_id uuid, _name text, _mime text, _size bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token uuid; v_path text; v_safe text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.integrity_cases
    where id = _case_id and reporter_user_id = auth.uid()
  ) then raise exception 'Case not available'; end if;

  perform public.integrity_validate_evidence_file(_name, _mime, _size);
  v_safe := regexp_replace(_name, '[^A-Za-z0-9._-]+', '-', 'g');
  v_path := 'case/' || _case_id::text || '/reporter/' || encode(extensions.gen_random_bytes(10), 'hex') || '-' || v_safe;
  insert into public.integrity_evidence_upload_tokens(case_id, object_path, original_name, mime_type, expected_size, created_by)
  values (_case_id, v_path, _name, _mime, _size, auth.uid())
  returning id into v_token;

  return jsonb_build_object('token_id', v_token, 'object_path', v_path, 'bucket', 'integrity-evidence');
end;
$$;
revoke all on function public.create_protected_evidence_upload(uuid, text, text, bigint) from public;
grant execute on function public.create_protected_evidence_upload(uuid, text, text, bigint) to authenticated;

create or replace function public.integrity_finalize_evidence_token(_token_id uuid, _case_id uuid, _created_by uuid)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare v_token public.integrity_evidence_upload_tokens%rowtype; v_id uuid;
begin
  select * into v_token
  from public.integrity_evidence_upload_tokens
  where id = _token_id and case_id = _case_id
  for update;

  if v_token.id is null or v_token.used_at is not null or v_token.expires_at <= now() then
    raise exception 'Evidence upload token is invalid or expired';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'integrity-evidence' and name = v_token.object_path
  ) then raise exception 'Evidence file has not been uploaded'; end if;

  insert into public.integrity_case_evidence(
    case_id, source_role, evidence_type, title, storage_path,
    original_name, mime_type, size_bytes, provenance, created_by
  ) values (
    _case_id, 'reporter', 'file', v_token.original_name, v_token.object_path,
    v_token.original_name, v_token.mime_type, v_token.expected_size,
    'Submitted through protected reporter evidence channel', _created_by
  ) returning id into v_id;

  update public.integrity_evidence_upload_tokens set used_at = now() where id = _token_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (_case_id, 'evidence.added', 'Reporter added evidence: ' || v_token.original_name, _created_by);
  return v_id;
end;
$$;
revoke all on function public.integrity_finalize_evidence_token(uuid, uuid, uuid) from public;

create or replace function public.public_finalize_anonymous_evidence(_case_code text, _recovery_key text, _token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_case uuid; v_hash text; v_id uuid;
begin
  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.id into v_case
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(trim(_case_code))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash;
  if v_case is null then raise exception 'Case code or recovery key is incorrect'; end if;

  v_id := public.integrity_finalize_evidence_token(_token_id, v_case, null);
  return jsonb_build_object('ok', true, 'evidence_id', v_id, 'snapshot', public.integrity_case_snapshot(v_case));
end;
$$;
revoke all on function public.public_finalize_anonymous_evidence(text, text, uuid) from public;
grant execute on function public.public_finalize_anonymous_evidence(text, text, uuid) to anon, authenticated;

create or replace function public.finalize_protected_evidence(_case_id uuid, _token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.integrity_cases
    where id = _case_id and reporter_user_id = auth.uid()
  ) then raise exception 'Case not available'; end if;
  v_id := public.integrity_finalize_evidence_token(_token_id, _case_id, auth.uid());
  return jsonb_build_object('ok', true, 'evidence_id', v_id, 'snapshot', public.integrity_case_snapshot(_case_id));
end;
$$;
revoke all on function public.finalize_protected_evidence(uuid, uuid) from public;
grant execute on function public.finalize_protected_evidence(uuid, uuid) to authenticated;

create or replace function public.admin_register_integrity_evidence(_case_id uuid, _evidence_type text, _title text, _description text default null, _external_url text default null, _visible_to_reporter boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _evidence_type not in ('url','text','voting_analysis','statement') then raise exception 'Invalid evidence type'; end if;
  insert into public.integrity_case_evidence(case_id, source_role, evidence_type, title, description, external_url, visible_to_reporter, created_by)
  values (_case_id, 'tsbc', _evidence_type, trim(_title), nullif(trim(coalesce(_description, '')), ''), nullif(trim(coalesce(_external_url, '')), ''), _visible_to_reporter, auth.uid())
  returning id into v_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (_case_id, 'evidence.added', 'TSBC added evidence: ' || trim(_title), _visible_to_reporter, auth.uid());
  return jsonb_build_object('ok', true, 'evidence_id', v_id);
end;
$$;
revoke all on function public.admin_register_integrity_evidence(uuid, text, text, text, text, boolean) from public;
grant execute on function public.admin_register_integrity_evidence(uuid, text, text, text, text, boolean) to authenticated;

commit;
