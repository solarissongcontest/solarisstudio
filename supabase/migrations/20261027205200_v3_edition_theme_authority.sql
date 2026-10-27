begin;

select public.v3_register_migration_contract(
  'v3.edition.theme-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Move edition default-theme attachment behind an actor-scoped locked compare-and-swap command with stable semantic operation identity, audit and edition.changed persistence.'
);

create or replace function public.v3_apply_edition_theme_change(
  p_edition_id uuid,
  p_expected_theme_id uuid,
  p_theme_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current public.editions%rowtype;
  v_next public.editions%rowtype;
  v_fingerprint text;
  v_operation_id uuid;
  v_claim jsonb;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if p_edition_id is null or length(coalesce(v_reason, '')) < 5 then
    raise exception 'VALIDATION: edition and reason are required' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: edition.manage required for this edition' using errcode = '42501';
  end if;
  if p_theme_id is not null and not exists (select 1 from public.themes where id = p_theme_id) then
    raise exception 'VALIDATION: target theme does not exist' using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'edition.theme.change', 'R1', jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('actor', v_actor, 'expectedThemeId', p_expected_theme_id,
      'themeId', p_theme_id, 'reason', v_reason)
  );
  v_operation_id := (
    substr(v_fingerprint,1,8)||'-'||substr(v_fingerprint,9,4)||'-'||
    substr(v_fingerprint,13,4)||'-'||substr(v_fingerprint,17,4)||'-'||
    substr(v_fingerprint,21,12)
  )::uuid;
  v_claim := private.studio2_claim_operation(
    v_operation_id,
    'edition.theme:' || v_fingerprint,
    v_operation_id,
    'edition.theme.change',
    'R1',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('expectedThemeId', p_expected_theme_id, 'themeId', p_theme_id, 'reason', v_reason)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'failed' then
      raise exception 'STATE_CHANGED: reconcile the existing edition theme operation' using errcode = 'PT409';
    end if;
    return (v_claim -> 'result') || jsonb_build_object('replayed', true);
  end if;

  select * into v_current
  from public.editions
  where id = p_edition_id
  for update;
  if not found then raise exception 'Edition not found' using errcode = 'P0002'; end if;
  if v_current.theme_id is distinct from p_expected_theme_id then
    raise exception 'STATE_CHANGED: edition theme changed since this review was loaded' using errcode = 'PT409';
  end if;

  if p_theme_id is not distinct from p_expected_theme_id then
    v_result := jsonb_build_object(
      'ok', true, 'operationId', v_operation_id, 'replayed', false,
      'changed', false, 'edition', to_jsonb(v_current)
    );
    return private.studio2_complete_operation(v_operation_id, v_result);
  end if;

  update public.editions
  set theme_id = p_theme_id,
      data_revision = data_revision + 1
  where id = p_edition_id and theme_id is not distinct from p_expected_theme_id
  returning * into v_next;
  if not found then
    raise exception 'STATE_CHANGED: edition theme changed immediately before apply' using errcode = 'PT409';
  end if;

  insert into public.studio2_contest_events(
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id, 'edition.metadata_changed', v_actor, 'edition', p_edition_id::text,
    jsonb_build_object(
      'changeKind', 'edition.theme.change',
      'operationId', v_operation_id,
      'changedFields', jsonb_build_array('theme_id'),
      'fromRevision', v_current.data_revision,
      'toRevision', v_next.data_revision,
      'reason', v_reason
    )
  );

  perform private.v3_emit_domain_event(
    'edition.changed', 'edition', p_edition_id::text, v_next.data_revision,
    v_operation_id, p_edition_id, null,
    jsonb_build_object(
      'changeKind', 'theme',
      'changedFields', jsonb_build_array('theme_id'),
      'previousRevision', v_current.data_revision,
      'revision', v_next.data_revision
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true, 'operationId', v_operation_id, 'replayed', false,
    'changed', true, 'edition', to_jsonb(v_next)
  );
  return private.studio2_complete_operation(v_operation_id, v_result);
end
$command$;

revoke all on function public.v3_apply_edition_theme_change(uuid,uuid,uuid,text)
  from public, anon, service_role;
grant execute on function public.v3_apply_edition_theme_change(uuid,uuid,uuid,text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
