begin;

create or replace function public.admin_discard_expired_evidence_upload(_token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_case_id uuid;
  v_path text;
  v_used_at timestamptz;
  v_expires_at timestamptz;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;

  select case_id, object_path, used_at, expires_at
  into v_case_id, v_path, v_used_at, v_expires_at
  from public.integrity_evidence_upload_tokens
  where id = _token_id
  for update;

  if v_case_id is null then raise exception 'Evidence upload token not found'; end if;
  if v_used_at is not null then raise exception 'Finalised evidence upload tokens cannot be discarded'; end if;
  if v_expires_at > now() then raise exception 'Evidence upload token has not expired'; end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'integrity-evidence' and name = v_path
  ) then
    raise exception 'Delete the orphaned private storage object before discarding its upload token';
  end if;

  delete from public.integrity_evidence_upload_tokens where id = _token_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    v_case_id,
    'evidence.expired_upload_cleaned',
    'Expired unfinished evidence upload was removed from the private evidence lifecycle',
    false,
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'token_id', _token_id);
end;
$$;
revoke all on function public.admin_discard_expired_evidence_upload(uuid) from public;
grant execute on function public.admin_discard_expired_evidence_upload(uuid) to authenticated;

commit;
