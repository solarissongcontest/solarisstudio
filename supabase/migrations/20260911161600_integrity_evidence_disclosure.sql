begin;

-- Evidence redaction/disclosure is append-only. The original row remains intact;
-- organisers create a linked derivative that can be disclosed without leaking
-- the private storage locator or rewriting history.
alter table public.integrity_evidence_upload_tokens
  add column if not exists derivative_source_evidence_id uuid null references public.integrity_case_evidence(id) on delete set null,
  add column if not exists derivative_kind text null;

alter table public.integrity_evidence_upload_tokens
  drop constraint if exists integrity_evidence_upload_derivative_kind_check;
alter table public.integrity_evidence_upload_tokens
  add constraint integrity_evidence_upload_derivative_kind_check
  check (derivative_kind is null or derivative_kind in ('redacted', 'disclosure', 'redacted_disclosure'));

alter table public.integrity_case_evidence
  drop constraint if exists integrity_evidence_not_own_redaction_source;
alter table public.integrity_case_evidence
  add constraint integrity_evidence_not_own_redaction_source
  check (redacted_from_id is null or redacted_from_id <> id);

alter table public.integrity_case_evidence
  drop constraint if exists integrity_evidence_not_own_disclosure_source;
alter table public.integrity_case_evidence
  add constraint integrity_evidence_not_own_disclosure_source
  check (disclosure_copy_of_id is null or disclosure_copy_of_id <> id);

create index if not exists integrity_case_evidence_redacted_from_idx
  on public.integrity_case_evidence(redacted_from_id)
  where redacted_from_id is not null;
create index if not exists integrity_case_evidence_disclosure_copy_idx
  on public.integrity_case_evidence(disclosure_copy_of_id)
  where disclosure_copy_of_id is not null;

create or replace function public.integrity_validate_evidence_lineage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_case uuid;
begin
  if new.redacted_from_id is not null then
    select e.case_id into v_source_case
    from public.integrity_case_evidence e
    where e.id = new.redacted_from_id;
    if v_source_case is null then raise exception 'Redaction source evidence does not exist'; end if;
    if v_source_case <> new.case_id then raise exception 'Redaction source must belong to the same case'; end if;
  end if;

  if new.disclosure_copy_of_id is not null then
    select e.case_id into v_source_case
    from public.integrity_case_evidence e
    where e.id = new.disclosure_copy_of_id;
    if v_source_case is null then raise exception 'Disclosure source evidence does not exist'; end if;
    if v_source_case <> new.case_id then raise exception 'Disclosure source must belong to the same case'; end if;
  end if;

  return new;
end;
$$;
revoke all on function public.integrity_validate_evidence_lineage() from public;

drop trigger if exists integrity_evidence_validate_lineage on public.integrity_case_evidence;
create trigger integrity_evidence_validate_lineage
before insert or update of case_id, redacted_from_id, disclosure_copy_of_id
on public.integrity_case_evidence
for each row execute function public.integrity_validate_evidence_lineage();

create or replace function public.admin_create_integrity_evidence_derivative_upload(
  _source_evidence_id uuid,
  _name text,
  _mime text,
  _size bigint,
  _kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_case_id uuid;
  v_source_status text;
  v_token uuid;
  v_path text;
  v_safe text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _kind := lower(trim(coalesce(_kind, '')));
  if _kind not in ('redacted', 'disclosure', 'redacted_disclosure') then
    raise exception 'Invalid evidence derivative kind';
  end if;

  select e.case_id, e.lifecycle_status
  into v_case_id, v_source_status
  from public.integrity_case_evidence e
  where e.id = _source_evidence_id
  for share;

  if v_case_id is null then raise exception 'Source evidence not found'; end if;
  if v_source_status = 'deleted' then raise exception 'Deleted evidence cannot be used as a derivative source'; end if;

  perform public.integrity_validate_evidence_file(_name, _mime, _size);
  v_safe := regexp_replace(_name, '[^A-Za-z0-9._-]+', '-', 'g');
  v_path := 'case/' || v_case_id::text || '/tsbc/' || encode(extensions.gen_random_bytes(10), 'hex') || '-' || v_safe;

  insert into public.integrity_evidence_upload_tokens(
    case_id,
    object_path,
    original_name,
    mime_type,
    expected_size,
    created_by,
    derivative_source_evidence_id,
    derivative_kind
  ) values (
    v_case_id,
    v_path,
    _name,
    _mime,
    _size,
    auth.uid(),
    _source_evidence_id,
    _kind
  ) returning id into v_token;

  return jsonb_build_object(
    'token_id', v_token,
    'object_path', v_path,
    'bucket', 'integrity-evidence',
    'source_evidence_id', _source_evidence_id,
    'kind', _kind
  );
end;
$$;
revoke all on function public.admin_create_integrity_evidence_derivative_upload(uuid, text, text, bigint, text) from public;
grant execute on function public.admin_create_integrity_evidence_derivative_upload(uuid, text, text, bigint, text) to authenticated;

create or replace function public.admin_finalize_integrity_evidence_derivative(
  _token_id uuid,
  _title text,
  _description text default null,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_token public.integrity_evidence_upload_tokens%rowtype;
  v_source public.integrity_case_evidence%rowtype;
  v_id uuid;
  v_title text;
  v_reason text;
  v_redacted_from uuid;
  v_disclosure_of uuid;
  v_visible boolean;
  v_event text;
  v_event_visible boolean;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  v_title := trim(coalesce(_title, ''));
  v_reason := trim(coalesce(_reason, ''));
  if char_length(v_title) < 2 or char_length(v_title) > 240 then
    raise exception 'Derivative evidence title must be between 2 and 240 characters';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 4000 then
    raise exception 'Disclosure/redaction reason must be between 10 and 4000 characters';
  end if;

  select * into v_token
  from public.integrity_evidence_upload_tokens
  where id = _token_id
  for update;

  if v_token.id is null
     or v_token.derivative_source_evidence_id is null
     or v_token.derivative_kind is null
     or v_token.used_at is not null
     or v_token.expires_at <= now() then
    raise exception 'Evidence derivative upload token is invalid or expired';
  end if;

  select * into v_source
  from public.integrity_case_evidence
  where id = v_token.derivative_source_evidence_id
  for share;

  if v_source.id is null then raise exception 'Source evidence not found'; end if;
  if v_source.case_id <> v_token.case_id then raise exception 'Derivative source must belong to the upload case'; end if;
  if v_source.lifecycle_status = 'deleted' then raise exception 'Deleted evidence cannot be used as a derivative source'; end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'integrity-evidence' and o.name = v_token.object_path
  ) then raise exception 'Evidence derivative file has not been uploaded'; end if;

  v_redacted_from := case when v_token.derivative_kind in ('redacted', 'redacted_disclosure') then v_source.id else null end;
  v_disclosure_of := case when v_token.derivative_kind in ('disclosure', 'redacted_disclosure') then v_source.id else null end;
  v_visible := v_token.derivative_kind in ('disclosure', 'redacted_disclosure');

  insert into public.integrity_case_evidence(
    case_id,
    source_role,
    evidence_type,
    title,
    description,
    storage_path,
    original_name,
    mime_type,
    size_bytes,
    provenance,
    redacted_from_id,
    disclosure_copy_of_id,
    visible_to_reporter,
    created_by
  ) values (
    v_source.case_id,
    'tsbc',
    'file',
    v_title,
    nullif(trim(coalesce(_description, '')), ''),
    v_token.object_path,
    v_token.original_name,
    v_token.mime_type,
    v_token.expected_size,
    'Immutable ' || replace(v_token.derivative_kind, '_', ' ') || ' derivative: ' || v_reason,
    v_redacted_from,
    v_disclosure_of,
    v_visible,
    auth.uid()
  ) returning id into v_id;

  update public.integrity_evidence_upload_tokens
  set used_at = now()
  where id = _token_id;

  v_event := case
    when v_token.derivative_kind = 'redacted' then 'evidence.redacted'
    else 'evidence.disclosure_created'
  end;
  v_event_visible := v_visible;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    v_source.case_id,
    v_event,
    case when v_visible
      then 'TSBC created a protected evidence disclosure copy'
      else 'TSBC created an internal redacted evidence derivative'
    end,
    v_event_visible,
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'evidence_id', v_id,
    'source_evidence_id', v_source.id,
    'kind', v_token.derivative_kind,
    'visible_to_reporter', v_visible
  );
end;
$$;
revoke all on function public.admin_finalize_integrity_evidence_derivative(uuid, text, text, text) from public;
grant execute on function public.admin_finalize_integrity_evidence_derivative(uuid, text, text, text) to authenticated;

-- Text/URL/statement evidence can be disclosed without fabricating a file. The
-- organiser supplies the redacted public-facing content; the original record is
-- still retained unchanged and linked as provenance.
create or replace function public.admin_create_integrity_evidence_disclosure_copy(
  _source_evidence_id uuid,
  _title text,
  _description text,
  _external_url text default null,
  _redacted boolean default false,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.integrity_case_evidence%rowtype;
  v_id uuid;
  v_title text;
  v_reason text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  select * into v_source
  from public.integrity_case_evidence
  where id = _source_evidence_id
  for share;

  if v_source.id is null then raise exception 'Source evidence not found'; end if;
  if v_source.lifecycle_status = 'deleted' then raise exception 'Deleted evidence cannot be disclosed'; end if;
  if v_source.evidence_type = 'file' then raise exception 'File evidence requires the derivative upload workflow'; end if;

  v_title := trim(coalesce(_title, ''));
  v_reason := trim(coalesce(_reason, ''));
  if char_length(v_title) < 2 or char_length(v_title) > 240 then
    raise exception 'Disclosure title must be between 2 and 240 characters';
  end if;
  if char_length(trim(coalesce(_description, ''))) < 2 then
    raise exception 'Disclosure content is required';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 4000 then
    raise exception 'Disclosure reason must be between 10 and 4000 characters';
  end if;

  insert into public.integrity_case_evidence(
    case_id,
    source_role,
    evidence_type,
    title,
    description,
    external_url,
    provenance,
    redacted_from_id,
    disclosure_copy_of_id,
    visible_to_reporter,
    created_by
  ) values (
    v_source.case_id,
    'tsbc',
    v_source.evidence_type,
    v_title,
    trim(_description),
    nullif(trim(coalesce(_external_url, '')), ''),
    'Immutable disclosure copy: ' || v_reason,
    case when _redacted then v_source.id else null end,
    v_source.id,
    true,
    auth.uid()
  ) returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    v_source.case_id,
    'evidence.disclosure_created',
    'TSBC created a protected evidence disclosure copy',
    true,
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'evidence_id', v_id,
    'source_evidence_id', v_source.id,
    'kind', case when _redacted then 'redacted_disclosure' else 'disclosure' end,
    'visible_to_reporter', true
  );
end;
$$;
revoke all on function public.admin_create_integrity_evidence_disclosure_copy(uuid, text, text, text, boolean, text) from public;
grant execute on function public.admin_create_integrity_evidence_disclosure_copy(uuid, text, text, text, boolean, text) to authenticated;

commit;
