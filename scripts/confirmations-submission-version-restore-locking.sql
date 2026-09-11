-- Applied immediately after confirmations-submission-version-restore.sql.
-- Ordinary confirmation edits lock submission_rounds first. Keep organizer
-- restores on the same lock order so a simultaneous edit/restore cannot race
-- version allocation or deadlock on opposite row-lock ordering.

alter function public.admin_restore_confirmation_version(uuid, uuid, text)
  rename to admin_restore_confirmation_version_apply;

revoke all on function public.admin_restore_confirmation_version_apply(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.admin_restore_confirmation_version(
  _submission_id uuid,
  _version_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  target_round_id uuid;
  native_admin boolean := false;
  solaris_admin boolean := false;
begin
  native_admin := auth.uid() is not null
    and public.has_role(auth.uid(), 'admin'::public.app_role);
  if not native_admin then
    solaris_admin := public.is_solaris_organizer_request();
  end if;
  if not (native_admin or solaris_admin) then
    raise exception 'Forbidden';
  end if;

  if nullif(btrim(coalesce(_reason, '')), '') is null then
    raise exception 'Restore reason is required';
  end if;

  select s.round_id
  into target_round_id
  from public.submissions s
  where s.id = _submission_id;

  if target_round_id is null then
    raise exception 'Submission not found';
  end if;

  -- Match submit_confirmation(): round first, then submission inside the helper.
  perform 1
  from public.submission_rounds r
  where r.id = target_round_id
  for update;

  return public.admin_restore_confirmation_version_apply(
    _submission_id,
    _version_id,
    _reason
  );
end;
$$;

revoke all on function public.admin_restore_confirmation_version(uuid, uuid, text)
  from public;
grant execute on function public.admin_restore_confirmation_version(uuid, uuid, text)
  to anon, authenticated, service_role;
