begin;

-- System V3 S7: give Organizer voting-declaration invalidation an explicit
-- reviewed-edition binding without replacing the canonical declaration owner.
--
-- The legacy one-argument preview / five-argument apply continue to exist for
-- compatibility until the Organizer caller is cut over. These overloads are the
-- fail-closed V3 boundary: the declaration's authoritative Solaris edition is
-- still derived by the database, then compared with the edition the caller says
-- it reviewed. A route/context drift therefore fails before any operation claim
-- or declaration mutation.

create or replace function public.studio2_voting_declaration_invalidation_preview(
  p_preflight_id uuid,
  p_expected_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting
as $preview$
declare
  v_snapshot jsonb;
  v_actual_edition_id uuid;
begin
  if p_expected_edition_id is null then
    raise exception 'Expected Organizer edition is required'
      using errcode = '22023';
  end if;

  -- Reuse the existing canonical preview for declaration state, lifecycle and
  -- capability enforcement. It derives edition authority from the declaration,
  -- never from this caller-supplied value.
  v_snapshot := public.studio2_voting_declaration_invalidation_preview(
    p_preflight_id
  );

  v_actual_edition_id := nullif(v_snapshot ->> 'editionId', '')::uuid;
  if v_actual_edition_id is null then
    raise exception 'Voting declaration has no canonical Solaris edition'
      using errcode = 'P0002';
  end if;

  if v_actual_edition_id is distinct from p_expected_edition_id then
    raise exception 'Voting declaration is outside the reviewed Organizer edition'
      using errcode = '42501';
  end if;

  return v_snapshot || jsonb_build_object(
    'expectedEditionId', p_expected_edition_id
  );
end
$preview$;

revoke all on function public.studio2_voting_declaration_invalidation_preview(
  uuid, uuid
) from public, anon;
grant execute on function public.studio2_voting_declaration_invalidation_preview(
  uuid, uuid
) to authenticated, service_role;

create or replace function public.studio2_apply_voting_declaration_invalidation(
  p_preflight_id uuid,
  p_expected_edition_id uuid,
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
  v_preview jsonb;
  v_actual_edition_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if p_expected_edition_id is null then
    raise exception 'Expected Organizer edition is required'
      using errcode = '22023';
  end if;

  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A declaration invalidation reason of at least 5 characters is required'
      using errcode = '22023';
  end if;

  -- Lock the canonical declaration before resolving and comparing its scope.
  -- The caller-provided edition is evidence of reviewed context, never authority.
  select *
  into v_row
  from televoting.vote_preflight_checks
  where id = p_preflight_id
  for update;

  if v_row.id is null then
    raise exception 'Voting declaration not found' using errcode = 'P0002';
  end if;

  v_actual_edition_id := private.studio2_voting_declaration_edition_id(
    p_preflight_id
  );
  if v_actual_edition_id is null then
    raise exception 'Voting declaration has no canonical Solaris edition'
      using errcode = 'P0002';
  end if;

  if v_actual_edition_id is distinct from p_expected_edition_id then
    raise exception 'Voting declaration is outside the reviewed Organizer edition'
      using errcode = '42501';
  end if;

  if v_row.declaration_version is distinct from p_expected_version then
    raise exception 'Voting declaration changed since this preview was loaded. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  -- The two-argument preview independently re-derives declaration state and
  -- enforces integrity.manage against the canonical declaration edition.
  v_preview := public.studio2_voting_declaration_invalidation_preview(
    p_preflight_id,
    p_expected_edition_id
  );

  if coalesce((v_preview ->> 'alreadyApplied')::boolean, false) then
    return jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'id', p_preflight_id,
      'editionId', v_actual_edition_id,
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
      'editionId', v_actual_edition_id,
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
      'editionId', v_actual_edition_id,
      'state', v_preview ->> 'state',
      'statementVersion', v_preview -> 'statementVersion'
    ),
    jsonb_build_object(
      'editionId', v_actual_edition_id,
      'state', 'invalidated',
      'reason', v_reason,
      'declarationVersion', v_row.declaration_version
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'id', p_preflight_id,
    'editionId', v_actual_edition_id,
    'state', 'invalidated',
    'version', v_row.declaration_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_voting_declaration_invalidation(
  uuid, uuid, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_voting_declaration_invalidation(
  uuid, uuid, text, uuid, text, bigint
) to authenticated, service_role;

comment on function public.studio2_voting_declaration_invalidation_preview(uuid, uuid)
is 'V3 voting-declaration invalidation preview bound to the Organizer edition that was actually reviewed.';

comment on function public.studio2_apply_voting_declaration_invalidation(uuid, uuid, text, uuid, text, bigint)
is 'V3 voting-declaration invalidation apply bound to server-derived declaration edition plus caller-reviewed Organizer edition.';

notify pgrst, 'reload schema';

commit;
