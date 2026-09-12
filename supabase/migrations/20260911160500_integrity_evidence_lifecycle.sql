begin;

alter table public.integrity_case_evidence
  add column if not exists retention_until timestamptz null,
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists deletion_reason text null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null;

alter table public.integrity_case_evidence
  drop constraint if exists integrity_evidence_lifecycle_status_check;
alter table public.integrity_case_evidence
  add constraint integrity_evidence_lifecycle_status_check
  check (lifecycle_status in ('active', 'scheduled_for_deletion', 'deleted'));

alter table public.integrity_case_evidence
  drop constraint if exists integrity_evidence_lifecycle_consistency;
alter table public.integrity_case_evidence
  add constraint integrity_evidence_lifecycle_consistency check (
    (lifecycle_status = 'active' and deleted_at is null)
    or
    (lifecycle_status = 'scheduled_for_deletion' and retention_until is not null and deletion_reason is not null and deleted_at is null)
    or
    (lifecycle_status = 'deleted' and deleted_at is not null and deletion_reason is not null)
  );

create index if not exists integrity_case_evidence_retention_idx
  on public.integrity_case_evidence(retention_until, lifecycle_status)
  where retention_until is not null;

create table if not exists public.integrity_evidence_access_log (
  id uuid primary key default extensions.gen_random_uuid(),
  evidence_id uuid null references public.integrity_case_evidence(id) on delete set null,
  case_id uuid not null references public.integrity_cases(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('reporter', 'organizer', 'system')),
  action text not null check (action in ('access_descriptor', 'download_requested')),
  detail text null,
  created_at timestamptz not null default now()
);
create index if not exists integrity_evidence_access_case_created_idx
  on public.integrity_evidence_access_log(case_id, created_at desc);
create index if not exists integrity_evidence_access_evidence_created_idx
  on public.integrity_evidence_access_log(evidence_id, created_at desc)
  where evidence_id is not null;

alter table public.integrity_evidence_access_log enable row level security;
revoke all on public.integrity_evidence_access_log from anon, authenticated;

-- A protected reporter may read only a file that is both attached to their case
-- AND explicitly reporter-visible. Case ownership alone is not enough.
create or replace function public.integrity_can_read_evidence_object(_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.integrity_is_organizer()
    or exists (
      select 1
      from public.integrity_cases c
      join public.integrity_case_evidence e
        on e.case_id = c.id
       and e.storage_path = _name
       and e.visible_to_reporter = true
       and e.lifecycle_status = 'active'
      where c.id = public.integrity_case_id_from_object_path(_name)
        and c.reporter_user_id = auth.uid()
    );
$$;
revoke all on function public.integrity_can_read_evidence_object(text) from public;
grant execute on function public.integrity_can_read_evidence_object(text) to authenticated;

create or replace function public.integrity_apply_case_retention_to_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_retention timestamptz;
begin
  if new.retention_until is null then
    select retention_until into v_case_retention
    from public.integrity_cases
    where id = new.case_id;
    new.retention_until := v_case_retention;
  end if;
  return new;
end;
$$;
revoke all on function public.integrity_apply_case_retention_to_evidence() from public;

drop trigger if exists integrity_evidence_inherit_case_retention on public.integrity_case_evidence;
create trigger integrity_evidence_inherit_case_retention
before insert on public.integrity_case_evidence
for each row execute function public.integrity_apply_case_retention_to_evidence();

update public.integrity_case_evidence e
set retention_until = c.retention_until
from public.integrity_cases c
where e.case_id = c.id
  and e.retention_until is null
  and c.retention_until is not null;

create or replace function public.admin_set_integrity_case_retention(
  _case_id uuid,
  _retention_until timestamptz,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  if not exists (select 1 from public.integrity_cases where id = _case_id) then
    raise exception 'Integrity case not found';
  end if;
  if _retention_until is null or _retention_until <= now() then
    raise exception 'Retention date must be in the future';
  end if;
  if char_length(_reason) < 10 or char_length(_reason) > 4000 then
    raise exception 'Retention reason must be between 10 and 4000 characters';
  end if;

  update public.integrity_cases
  set retention_until = _retention_until, updated_at = now()
  where id = _case_id;

  update public.integrity_case_evidence
  set retention_until = _retention_until
  where case_id = _case_id and lifecycle_status = 'active';

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    _case_id,
    'retention.updated',
    'Evidence retention scheduled until ' || _retention_until::text || ': ' || _reason,
    false,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'case_id', _case_id, 'retention_until', _retention_until);
end;
$$;
revoke all on function public.admin_set_integrity_case_retention(uuid, timestamptz, text) from public;
grant execute on function public.admin_set_integrity_case_retention(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_schedule_integrity_evidence_deletion(
  _evidence_id uuid,
  _delete_after timestamptz,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_status text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  select case_id, lifecycle_status into v_case_id, v_status
  from public.integrity_case_evidence
  where id = _evidence_id
  for update;
  if v_case_id is null then raise exception 'Evidence not found'; end if;
  if v_status = 'deleted' then raise exception 'Deleted evidence cannot be scheduled again'; end if;
  if _delete_after is null or _delete_after <= now() then raise exception 'Deletion time must be in the future'; end if;
  if char_length(_reason) < 10 or char_length(_reason) > 4000 then
    raise exception 'Deletion reason must be between 10 and 4000 characters';
  end if;

  update public.integrity_case_evidence
  set lifecycle_status = 'scheduled_for_deletion',
      retention_until = _delete_after,
      deletion_reason = _reason
  where id = _evidence_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (v_case_id, 'evidence.deletion_scheduled', 'Evidence deletion scheduled: ' || _reason, false, auth.uid());

  return jsonb_build_object('ok', true, 'evidence_id', _evidence_id, 'retention_until', _delete_after);
end;
$$;
revoke all on function public.admin_schedule_integrity_evidence_deletion(uuid, timestamptz, text) from public;
grant execute on function public.admin_schedule_integrity_evidence_deletion(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_cancel_integrity_evidence_deletion(_evidence_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_status text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  _reason := trim(coalesce(_reason, ''));
  select case_id, lifecycle_status into v_case_id, v_status
  from public.integrity_case_evidence
  where id = _evidence_id
  for update;
  if v_case_id is null then raise exception 'Evidence not found'; end if;
  if v_status <> 'scheduled_for_deletion' then raise exception 'Evidence is not scheduled for deletion'; end if;
  if char_length(_reason) < 10 or char_length(_reason) > 4000 then
    raise exception 'Cancellation reason must be between 10 and 4000 characters';
  end if;

  update public.integrity_case_evidence
  set lifecycle_status = 'active', deletion_reason = null
  where id = _evidence_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (v_case_id, 'evidence.deletion_cancelled', 'Evidence deletion cancelled: ' || _reason, false, auth.uid());

  return jsonb_build_object('ok', true, 'evidence_id', _evidence_id, 'status', 'active');
end;
$$;
revoke all on function public.admin_cancel_integrity_evidence_deletion(uuid, text) from public;
grant execute on function public.admin_cancel_integrity_evidence_deletion(uuid, text) to authenticated;

create or replace function public.admin_finalize_integrity_evidence_deletion(_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_case_id uuid;
  v_status text;
  v_retention timestamptz;
  v_path text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  select case_id, lifecycle_status, retention_until, storage_path
  into v_case_id, v_status, v_retention, v_path
  from public.integrity_case_evidence
  where id = _evidence_id
  for update;
  if v_case_id is null then raise exception 'Evidence not found'; end if;
  if v_status <> 'scheduled_for_deletion' then raise exception 'Evidence is not scheduled for deletion'; end if;
  if v_retention is null or v_retention > now() then raise exception 'Evidence retention period has not expired'; end if;
  if v_path is not null and exists (
    select 1 from storage.objects where bucket_id = 'integrity-evidence' and name = v_path
  ) then
    raise exception 'Delete the private storage object before finalising evidence deletion';
  end if;

  update public.integrity_case_evidence
  set lifecycle_status = 'deleted',
      visible_to_reporter = false,
      deleted_at = now(),
      deleted_by = auth.uid()
  where id = _evidence_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (v_case_id, 'evidence.deleted', 'Evidence retention lifecycle completed', false, auth.uid());

  return jsonb_build_object('ok', true, 'evidence_id', _evidence_id, 'status', 'deleted');
end;
$$;
revoke all on function public.admin_finalize_integrity_evidence_deletion(uuid) from public;
grant execute on function public.admin_finalize_integrity_evidence_deletion(uuid) to authenticated;

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
      'storage_path', e.storage_path,
      'original_name', e.original_name,
      'mime_type', e.mime_type,
      'retention_until', e.retention_until,
      'deletion_reason', e.deletion_reason
    ) order by e.retention_until asc)
    from public.integrity_case_evidence e
    join public.integrity_cases c on c.id = e.case_id
    where e.lifecycle_status = 'scheduled_for_deletion'
      and e.retention_until <= now()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_evidence_due_for_deletion() from public;
grant execute on function public.admin_integrity_evidence_due_for_deletion() to authenticated;

create or replace function public.reporter_integrity_evidence_access_descriptor(
  _case_id uuid,
  _evidence_id uuid,
  _action text default 'access_descriptor'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
  v_name text;
  v_mime text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.integrity_cases c
    where c.id = _case_id and c.reporter_user_id = auth.uid()
  ) then raise exception 'Case not available'; end if;
  if _action not in ('access_descriptor', 'download_requested') then raise exception 'Invalid evidence access action'; end if;

  select storage_path, original_name, mime_type
  into v_path, v_name, v_mime
  from public.integrity_case_evidence
  where id = _evidence_id
    and case_id = _case_id
    and visible_to_reporter = true
    and lifecycle_status = 'active'
    and storage_path is not null;
  if v_path is null then raise exception 'Evidence file is not available'; end if;

  insert into public.integrity_evidence_access_log(evidence_id, case_id, actor_user_id, actor_role, action)
  values (_evidence_id, _case_id, auth.uid(), 'reporter', _action);

  return jsonb_build_object(
    'bucket', 'integrity-evidence',
    'storage_path', v_path,
    'original_name', v_name,
    'mime_type', v_mime
  );
end;
$$;
revoke all on function public.reporter_integrity_evidence_access_descriptor(uuid, uuid, text) from public;
grant execute on function public.reporter_integrity_evidence_access_descriptor(uuid, uuid, text) to authenticated;

create or replace function public.admin_integrity_evidence_access_descriptor(
  _evidence_id uuid,
  _action text default 'access_descriptor'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_path text;
  v_name text;
  v_mime text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _action not in ('access_descriptor', 'download_requested') then raise exception 'Invalid evidence access action'; end if;

  select case_id, storage_path, original_name, mime_type
  into v_case_id, v_path, v_name, v_mime
  from public.integrity_case_evidence
  where id = _evidence_id and lifecycle_status <> 'deleted' and storage_path is not null;
  if v_case_id is null or v_path is null then raise exception 'Evidence file is not available'; end if;

  insert into public.integrity_evidence_access_log(evidence_id, case_id, actor_user_id, actor_role, action)
  values (_evidence_id, v_case_id, auth.uid(), 'organizer', _action);

  return jsonb_build_object(
    'bucket', 'integrity-evidence',
    'storage_path', v_path,
    'original_name', v_name,
    'mime_type', v_mime
  );
end;
$$;
revoke all on function public.admin_integrity_evidence_access_descriptor(uuid, text) from public;
grant execute on function public.admin_integrity_evidence_access_descriptor(uuid, text) to authenticated;

create or replace function public.admin_integrity_evidence_access_log(_case_id uuid)
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
      'id', l.id,
      'evidence_id', l.evidence_id,
      'actor_role', l.actor_role,
      'action', l.action,
      'detail', l.detail,
      'created_at', l.created_at
    ) order by l.created_at desc)
    from public.integrity_evidence_access_log l
    where l.case_id = _case_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_evidence_access_log(uuid) from public;
grant execute on function public.admin_integrity_evidence_access_log(uuid) to authenticated;

-- Expired, unused upload tokens can leave orphaned private objects if an upload
-- succeeds but finalisation never happens. Surface them for controlled cleanup.
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
      'object_path', t.object_path,
      'original_name', t.original_name,
      'expires_at', t.expires_at,
      'object_exists', exists (
        select 1 from storage.objects o
        where o.bucket_id = 'integrity-evidence' and o.name = t.object_path
      )
    ) order by t.expires_at asc)
    from public.integrity_evidence_upload_tokens t
    where t.used_at is null and t.expires_at <= now()
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_integrity_expired_evidence_uploads() from public;
grant execute on function public.admin_integrity_expired_evidence_uploads() to authenticated;

commit;