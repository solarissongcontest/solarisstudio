begin;

-- Organisation OS V5 voting declaration lifecycle.
-- The canonical declaration truth remains televoting.vote_preflight_checks.
-- Required/Signed/Missing/Wrong version are derived from evidence + policy.
-- Invalidated is the one explicit organizer transition and is versioned/audited.

create table if not exists public.studio2_voting_declaration_policy (
  singleton boolean primary key default true check (singleton),
  current_statement_version integer not null check (current_statement_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.studio2_voting_declaration_policy (
  singleton,
  current_statement_version
)
values (true, 2)
on conflict (singleton) do nothing;

alter table public.studio2_voting_declaration_policy enable row level security;
revoke all on table public.studio2_voting_declaration_policy
  from public, anon, authenticated;
grant all on table public.studio2_voting_declaration_policy to service_role;

alter table televoting.vote_preflight_checks
  add column if not exists declaration_version bigint not null default 1,
  add column if not exists declaration_invalidated_at timestamptz,
  add column if not exists declaration_invalidated_by uuid references auth.users(id) on delete set null,
  add column if not exists declaration_invalidation_reason text;

create or replace function private.studio2_touch_voting_declaration_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, televoting
as $touch$
begin
  if row(
    new.attested_at,
    new.signed_name,
    new.attestation_text,
    new.statement_version,
    new.submission_id,
    new.submitted_at,
    new.declaration_invalidated_at,
    new.declaration_invalidated_by,
    new.declaration_invalidation_reason
  ) is distinct from row(
    old.attested_at,
    old.signed_name,
    old.attestation_text,
    old.statement_version,
    old.submission_id,
    old.submitted_at,
    old.declaration_invalidated_at,
    old.declaration_invalidated_by,
    old.declaration_invalidation_reason
  ) then
    new.declaration_version := old.declaration_version + 1;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_voting_declaration_version()
  from public, anon, authenticated;

drop trigger if exists studio2_touch_voting_declaration_version
  on televoting.vote_preflight_checks;
create trigger studio2_touch_voting_declaration_version
before update of
  attested_at,
  signed_name,
  attestation_text,
  statement_version,
  submission_id,
  submitted_at,
  declaration_invalidated_at,
  declaration_invalidated_by,
  declaration_invalidation_reason
on televoting.vote_preflight_checks
for each row execute function private.studio2_touch_voting_declaration_version();

create or replace function private.studio2_voting_declaration_state(
  p_requires_attestation boolean,
  p_attested_at timestamptz,
  p_expires_at timestamptz,
  p_statement_version integer,
  p_invalidated_at timestamptz
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $state$
  select case
    when not coalesce(p_requires_attestation, false) then 'not_required'
    when p_invalidated_at is not null then 'invalidated'
    when p_attested_at is null and p_expires_at <= now() then 'missing'
    when p_attested_at is null then 'required'
    when p_statement_version is distinct from (
      select policy.current_statement_version
      from public.studio2_voting_declaration_policy policy
      where policy.singleton = true
    ) then 'wrong_version'
    else 'signed'
  end;
$state$;

revoke all on function private.studio2_voting_declaration_state(
  boolean, timestamptz, timestamptz, integer, timestamptz
) from public, anon, authenticated;

create or replace function private.studio2_voting_declaration_edition_id(
  p_preflight_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $edition$
  select coalesce(vpc.canonical_edition_id, il.solaris_id)
  from televoting.vote_preflight_checks vpc
  left join televoting.rounds round on round.id = vpc.round_id
  left join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.remote_id = round.edition_id::text
  where vpc.id = p_preflight_id
  limit 1;
$edition$;

revoke all on function private.studio2_voting_declaration_edition_id(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_voting_declaration_snapshot(
  p_preflight_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $snapshot$
declare
  v_row televoting.vote_preflight_checks;
  v_edition_id uuid;
  v_required_version integer;
  v_state text;
begin
  select *
  into v_row
  from televoting.vote_preflight_checks
  where id = p_preflight_id;

  if v_row.id is null then
    raise exception 'Voting declaration not found' using errcode = 'P0002';
  end if;

  v_edition_id := private.studio2_voting_declaration_edition_id(p_preflight_id);
  if not public.studio2_access_allowed('integrity.read', v_edition_id, false)
     and not public.studio2_access_allowed('integrity.manage', v_edition_id, false) then
    raise exception 'Integrity read capability required' using errcode = '42501';
  end if;

  select current_statement_version
  into v_required_version
  from public.studio2_voting_declaration_policy
  where singleton = true;

  v_state := private.studio2_voting_declaration_state(
    v_row.requires_attestation,
    v_row.attested_at,
    v_row.expires_at,
    v_row.statement_version,
    v_row.declaration_invalidated_at
  );

  return jsonb_build_object(
    'id', v_row.id,
    'editionId', v_edition_id,
    'state', v_state,
    'declarationVersion', v_row.declaration_version,
    'statementVersion', v_row.statement_version,
    'requiredStatementVersion', v_required_version,
    'attestedAt', v_row.attested_at,
    'signedName', v_row.signed_name,
    'submittedAt', v_row.submitted_at,
    'expiresAt', v_row.expires_at,
    'invalidatedAt', v_row.declaration_invalidated_at,
    'invalidatedBy', v_row.declaration_invalidated_by,
    'invalidationReason', v_row.declaration_invalidation_reason
  );
end
$snapshot$;

revoke all on function public.studio2_voting_declaration_snapshot(uuid)
  from public, anon;
grant execute on function public.studio2_voting_declaration_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.studio2_voting_declaration_invalidation_preview(
  p_preflight_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $preview$
declare
  v_snapshot jsonb;
  v_state text;
begin
  v_snapshot := public.studio2_voting_declaration_snapshot(p_preflight_id);
  if not public.studio2_access_allowed(
    'integrity.manage',
    (v_snapshot ->> 'editionId')::uuid,
    false
  ) then
    raise exception 'Integrity management capability required' using errcode = '42501';
  end if;

  v_state := v_snapshot ->> 'state';
  if v_state = 'invalidated' then
    return v_snapshot || jsonb_build_object(
      'riskClass', 'R2',
      'alreadyApplied', true
    );
  end if;

  if v_state not in ('signed', 'wrong_version') then
    raise exception 'Only a signed voting declaration can be invalidated'
      using errcode = '23514';
  end if;

  return v_snapshot || jsonb_build_object(
    'riskClass', 'R2',
    'alreadyApplied', false
  );
end
$preview$;

revoke all on function public.studio2_voting_declaration_invalidation_preview(uuid)
  from public, anon;
grant execute on function public.studio2_voting_declaration_invalidation_preview(uuid)
  to authenticated, service_role;

create or replace function public.studio2_apply_voting_declaration_invalidation(
  p_preflight_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $apply$
declare
  v_row televoting.vote_preflight_checks;
  v_snapshot jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A declaration invalidation reason of at least 5 characters is required'
      using errcode = '22023';
  end if;

  select *
  into v_row
  from televoting.vote_preflight_checks
  where id = p_preflight_id
  for update;

  if v_row.id is null then
    raise exception 'Voting declaration not found' using errcode = 'P0002';
  end if;

  if v_row.declaration_version is distinct from p_expected_version then
    raise exception 'Voting declaration changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_snapshot := public.studio2_voting_declaration_invalidation_preview(p_preflight_id);
  if coalesce((v_snapshot ->> 'alreadyApplied')::boolean, false) then
    return jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'id', p_preflight_id,
      'state', 'invalidated',
      'version', v_row.declaration_version
    );
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'integrity.declaration.invalidate',
    'R2',
    jsonb_build_object(
      'preflightId', p_preflight_id,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  update televoting.vote_preflight_checks
  set
    declaration_invalidated_at = now(),
    declaration_invalidated_by = auth.uid(),
    declaration_invalidation_reason = v_reason
  where id = p_preflight_id
  returning * into v_row;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'voting_declaration_invalidated',
    'televoting.vote_preflight_checks',
    p_preflight_id::text,
    jsonb_build_object(
      'state', v_snapshot ->> 'state',
      'statementVersion', v_snapshot -> 'statementVersion'
    ),
    jsonb_build_object(
      'state', 'invalidated',
      'reason', v_reason,
      'declarationVersion', v_row.declaration_version
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'id', p_preflight_id,
    'state', 'invalidated',
    'version', v_row.declaration_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_voting_declaration_invalidation(
  uuid, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_voting_declaration_invalidation(
  uuid, text, uuid, text, bigint
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
