begin;

create or replace function private.solaris_confirmation_admin_read_allowed(
  p_edition_id uuid default null,
  p_require_global boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case
    when coalesce(p_require_global, false) or p_edition_id is null then
      public.studio2_access_allowed('confirmation.read', null, true)
    else
      public.studio2_access_allowed('confirmation.read', p_edition_id, false)
  end;
$$;

revoke all on function private.solaris_confirmation_admin_read_allowed(uuid, boolean) from public, anon, authenticated;
grant execute on function private.solaris_confirmation_admin_read_allowed(uuid, boolean) to service_role;

create or replace function private.solaris_confirmation_response_read_allowed(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce((
    select public.studio2_access_allowed('confirmation.read', submission.edition_id, false)
    from public.submissions submission
    where submission.id = p_submission_id
  ), false);
$$;

revoke all on function private.solaris_confirmation_response_read_allowed(uuid) from public, anon, authenticated;
grant execute on function private.solaris_confirmation_response_read_allowed(uuid) to service_role;

-- Preserve the existing projection bodies and change only their inspection
-- predicate. Never use this predicate for consequential mutations.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.studio2_country_cockpit(uuid)'::regprocedure,
    'public.studio2_hod_editions(uuid)'::regprocedure,
    'public.studio2_hod_context_legacy_roster(uuid,uuid)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    if position('''confirmation.manage''' in v_definition) = 0 then
      raise exception 'Expected confirmation.manage predicate not found in %', v_signature;
    end if;
    v_definition := replace(v_definition, '''confirmation.manage''', '''confirmation.read''');
    if position('''confirmation.manage''' in v_definition) <> 0 then
      raise exception 'Failed to remove confirmation.manage read predicate from %', v_signature;
    end if;
    execute v_definition;
  end loop;
end
$migration$;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_confirmation_editions()'::regprocedure) into v_definition;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'admin_confirmation_editions read predicate drifted';
  end if;
  execute replace(v_definition, 'private.solaris_confirmation_admin_allowed()', 'private.solaris_confirmation_admin_read_allowed(null, true)');

  select pg_get_functiondef('public.admin_confirmation_responses()'::regprocedure) into v_definition;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'admin_confirmation_responses read predicate drifted';
  end if;
  execute replace(v_definition, 'private.solaris_confirmation_admin_allowed()', 'private.solaris_confirmation_admin_read_allowed(null, true)');

  select pg_get_functiondef('public.admin_confirmation_response(uuid)'::regprocedure) into v_definition;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'admin_confirmation_response read predicate drifted';
  end if;
  execute replace(v_definition, 'private.solaris_confirmation_admin_allowed()', 'private.solaris_confirmation_response_read_allowed(_submission_id)');

  select pg_get_functiondef('public.admin_confirmation_requirements(uuid)'::regprocedure) into v_definition;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'admin_confirmation_requirements read predicate drifted';
  end if;
  execute replace(v_definition, 'private.solaris_confirmation_admin_allowed()', 'private.solaris_confirmation_admin_read_allowed(p_edition_id, false)');
end
$migration$;

comment on function private.solaris_confirmation_admin_read_allowed(uuid, boolean) is
  'Read-only Confirmation organizer authorization. Never use this predicate for consequential mutations.';
comment on function private.solaris_confirmation_response_read_allowed(uuid) is
  'Exact-response-edition Confirmation read authorization for organizer inspection.';

notify pgrst, 'reload schema';
commit;
