begin;

select public.v3_register_migration_contract(
  '20261020002700_confirmation_legacy_delete_fail_closed',
  1,
  'forward_fix_only',
  false,
  null,
  'Disable legacy destructive Confirmation response deletion until governed archival authority exists.'
);

-- Official Confirmation responses, their revisions, reviewed entries and audit
-- evidence are contest history. The old RPC performed an immediate DELETE by
-- submission id and cannot satisfy V3 preflight, exact-edition scope, expected
-- version, retention or receipt requirements. Keep the compatibility signature
-- so old clients fail explicitly instead of receiving a missing-function error.
create or replace function public.admin_confirmation_delete_response(
  _submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if _submission_id is null then
    raise exception 'Confirmation response id is required' using errcode = '22023';
  end if;

  raise exception 'Permanent Confirmation response deletion is disabled. Review the response dependencies and use the governed archival authority when available.'
    using errcode = '0A000',
          hint = 'Solaris V3 preserves official Confirmation history rather than deleting it through the legacy compatibility RPC.';
end;
$function$;

revoke all on function public.admin_confirmation_delete_response(uuid)
  from public, anon;
grant execute on function public.admin_confirmation_delete_response(uuid)
  to authenticated, service_role;

comment on function public.admin_confirmation_delete_response(uuid) is
  'Compatibility tombstone. V3 blocks destructive Confirmation deletion until an explicit archival/retention command exists.';

notify pgrst, 'reload schema';
commit;
