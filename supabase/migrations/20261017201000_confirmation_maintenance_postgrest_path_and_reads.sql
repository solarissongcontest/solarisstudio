begin;

-- Production PostgREST exposes request.path as /rest/v1/rpc/<function>, while
-- the first maintenance exception only matched /rpc/<function>. Preserve the
-- exact allowlists from 20261017194000, but extract an RPC name from either
-- shape by locating the /rpc/ segment instead of assuming it begins the path.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('private.studio2_data_api_operational_gate()'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio2_data_api_operational_gate() is missing';
  end if;

  if position('if v_path like ''/rpc/%'' then' in v_definition) = 0 then
    raise exception 'unexpected Data API gate path matcher; refusing maintenance patch';
  end if;

  if position(
    'v_rpc_name := split_part(split_part(v_path, ''/'', 3), ''?'', 1);'
    in v_definition
  ) = 0 then
    raise exception 'unexpected Data API gate RPC parser; refusing maintenance patch';
  end if;

  v_definition := replace(
    v_definition,
    'if v_path like ''/rpc/%'' then',
    'if position(''/rpc/'' in v_path) > 0 then'
  );

  v_definition := replace(
    v_definition,
    'v_rpc_name := split_part(split_part(v_path, ''/'', 3), ''?'', 1);',
    'v_rpc_name := split_part(split_part(v_path, ''/rpc/'', 2), ''?'', 1);'
  );

  execute v_definition;
end
$migration$;

-- The V3 Confirmation read cutover intentionally moved Organizer reads from the
-- legacy delegation.manage authority to confirmation.read. Next in Line was a
-- missed sibling read, and its failure poisoned the combined Responses screen
-- even though admin_confirmation_responses itself succeeded.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_confirmation_next_in_line(uuid)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'admin_confirmation_next_in_line(uuid) is missing';
  end if;

  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'Next in Line no longer has the expected legacy authority guard';
  end if;

  v_definition := replace(
    v_definition,
    'private.solaris_confirmation_admin_allowed()',
    'private.solaris_confirmation_admin_read_allowed(_edition_id, _edition_id is null)'
  );
  v_definition := replace(
    v_definition,
    'Missing Solaris capability: delegation.manage',
    'Missing Solaris capability: confirmation.read'
  );

  execute v_definition;
end
$migration$;

-- Calendar is another edition-scoped Organizer Confirmation read from the same
-- legacy bridge. Keep null scope global; otherwise require confirmation.read on
-- the exact selected edition. If only a round filter is supplied, derive its
-- edition before authorizing the read.
create or replace function private.solaris_confirmation_calendar_read_allowed(
  p_edition_id uuid,
  p_round_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_edition_id uuid := p_edition_id;
begin
  if v_edition_id is null and p_round_id is not null then
    select round.edition_id
    into v_edition_id
    from public.submission_rounds round
    where round.id = p_round_id;

    if v_edition_id is null then
      return false;
    end if;
  end if;

  return private.solaris_confirmation_admin_read_allowed(
    v_edition_id,
    v_edition_id is null
  );
end;
$$;

revoke all on function private.solaris_confirmation_calendar_read_allowed(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.solaris_confirmation_calendar_read_allowed(uuid, uuid)
  to service_role;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_confirmation_calendar(uuid,uuid)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'admin_confirmation_calendar(uuid,uuid) is missing';
  end if;

  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'Confirmation calendar no longer has the expected legacy authority guard';
  end if;

  v_definition := replace(
    v_definition,
    'private.solaris_confirmation_admin_allowed()',
    'private.solaris_confirmation_calendar_read_allowed(_edition_id, _round_id)'
  );
  v_definition := replace(
    v_definition,
    'Missing Solaris capability: delegation.manage',
    'Missing Solaris capability: confirmation.read'
  );

  execute v_definition;
end
$migration$;

-- Version history functions are read-only but were historically declared
-- VOLATILE, which makes the read_only Data API gate reject them. Their bodies
-- contain only reads, so make the declaration match reality and cut their
-- authority over to the same Confirmation read contract.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_confirmation_version_summary()'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'admin_confirmation_version_summary() is missing';
  end if;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'Version summary no longer has the expected legacy authority guard';
  end if;

  v_definition := replace(
    v_definition,
    'private.solaris_confirmation_admin_allowed()',
    'private.solaris_confirmation_admin_read_allowed(null, true)'
  );
  v_definition := replace(v_definition, 'raise exception ''Forbidden'';',
    'raise exception ''Missing Solaris capability: confirmation.read'' using errcode=''42501'';');
  execute v_definition;
end
$migration$;

alter function public.admin_confirmation_version_summary() stable;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_confirmation_versions(uuid)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'admin_confirmation_versions(uuid) is missing';
  end if;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'Confirmation versions no longer has the expected legacy authority guard';
  end if;

  v_definition := replace(
    v_definition,
    'private.solaris_confirmation_admin_allowed()',
    'private.solaris_confirmation_response_read_allowed(_submission_id)'
  );
  v_definition := replace(v_definition, 'raise exception ''Forbidden'';',
    'raise exception ''Missing Solaris capability: confirmation.read'' using errcode=''42501'';');
  execute v_definition;
end
$migration$;

alter function public.admin_confirmation_versions(uuid) stable;

-- Technical metadata and recovery codes contain IP/token or recovery material,
-- so do not broaden them to read-only capability. Move them off the obsolete
-- delegation.manage bridge to confirmation.manage while preserving their
-- stronger Organizer-only semantics.
create or replace function private.solaris_confirmation_response_manage_allowed(
  p_submission_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce((
    select public.studio2_access_allowed('confirmation.manage', submission.edition_id, false)
    from public.submissions submission
    where submission.id = p_submission_id
  ), false);
$$;

revoke all on function private.solaris_confirmation_response_manage_allowed(uuid)
  from public, anon, authenticated;
grant execute on function private.solaris_confirmation_response_manage_allowed(uuid)
  to service_role;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_confirmation_technical(uuid)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'admin_confirmation_technical(uuid) is missing';
  end if;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'Confirmation technical read no longer has the expected legacy authority guard';
  end if;

  v_definition := replace(
    v_definition,
    'private.solaris_confirmation_admin_allowed()',
    'private.solaris_confirmation_response_manage_allowed(_submission_id)'
  );
  v_definition := replace(
    v_definition,
    'Missing Solaris capability: delegation.manage',
    'Missing Solaris capability: confirmation.manage'
  );
  execute v_definition;
end
$migration$;

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.admin_confirmation_recovery_codes()'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'admin_confirmation_recovery_codes() is missing';
  end if;
  if position('private.solaris_confirmation_admin_allowed()' in v_definition) = 0 then
    raise exception 'Confirmation recovery code read no longer has the expected legacy authority guard';
  end if;

  v_definition := replace(
    v_definition,
    'private.solaris_confirmation_admin_allowed()',
    'public.studio2_access_allowed(''confirmation.manage'', null, true)'
  );
  v_definition := replace(
    v_definition,
    'Missing Solaris capability: delegation.manage',
    'Missing Solaris capability: confirmation.manage'
  );
  execute v_definition;
end
$migration$;

notify pgrst, 'reload schema';

commit;
