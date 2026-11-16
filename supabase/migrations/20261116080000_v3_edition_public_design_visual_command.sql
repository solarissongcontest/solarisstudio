begin;
select public.v3_register_migration_contract(
  'v3.edition.public-visual-command', 1, 'forward_fix_only', false, null,
  'Require an edition-scoped governed, revisioned and receipted public design change'
);

-- Forward-only port of the previously reviewed visual authority from #1851.
-- Scope deliberately excludes artwork URLs and logos: Media/Storage ownership
-- needs its own exact-byte finalization and cannot be set by a generic editor.
-- Do not replace an unexpected preexisting function during hosted upgrade.
do $preflight$
begin
  if to_regprocedure('public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)') is not null then
    raise exception 'Visual command already exists; inspect provenance before cutover' using errcode='55000';
  end if;
  if to_regclass('public.editions') is null or
     not exists(
       select 1 from pg_attribute
       where attrelid='public.editions'::regclass
         and attname='data_revision' and not attisdropped
     ) then
    raise exception 'Edition revision prerequisites absent' using errcode='55000';
  end if;
end
$preflight$;

create or replace function public.v3_apply_edition_visual_change(
  p_edition_id uuid,
  p_expected jsonb,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_current public.editions%rowtype;
  v_next public.editions%rowtype;
  v_key text;
  v_changed_fields jsonb;
  v_fingerprint text;
  v_operation_id uuid;
  v_claim jsonb;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if p_edition_id is null or jsonb_typeof(p_patch) is distinct from 'object'
     or p_patch = '{}'::jsonb or jsonb_typeof(p_expected) is distinct from 'object'
     or length(btrim(coalesce(p_reason, ''))) < 5
     or not (p_expected ? 'data_revision') or not (p_expected ? 'theme_colors')
     or not (p_expected ? 'name') or not (p_expected ? 'slug')
     or jsonb_typeof(p_expected -> 'data_revision') <> 'number' then
    raise exception 'VALIDATION: edition, expected visual state, patch and reason required' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key <> 'theme_colors'
       or not (p_expected ? v_key) then
      raise exception 'VALIDATION: unsupported visual field or missing comparison: %', v_key using errcode = '22023';
    end if;
  end loop;
  for v_key in select jsonb_object_keys(p_expected) loop
    if v_key not in ('data_revision','theme_colors','name','slug') then
      raise exception 'VALIDATION: unsupported comparison field' using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'theme_colors' and jsonb_typeof(p_patch -> 'theme_colors') not in ('object','null') then
    raise exception 'VALIDATION: theme colors must be an object or null' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, true) then
    raise exception 'AUTHORIZATION: edition.manage required for this edition' using errcode = '42501';
  end if;

  v_fingerprint := private.studio2_request_fingerprint('edition.visual.change', 'R1',
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object('actor', v_actor, 'expected', p_expected, 'patch', p_patch, 'reason', p_reason));
  v_operation_id := (substr(v_fingerprint,1,8)||'-'||substr(v_fingerprint,9,4)||'-'||substr(v_fingerprint,13,4)||'-'||substr(v_fingerprint,17,4)||'-'||substr(v_fingerprint,21,12))::uuid;
  v_claim := private.studio2_claim_operation(v_operation_id, 'edition.visual:'||v_fingerprint,
    v_operation_id, 'edition.visual.change', 'R1', jsonb_build_object('editionId',p_edition_id),
    jsonb_build_object('expected',p_expected,'patch',p_patch,'reason',p_reason));
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'failed' then
      raise exception 'STATE_CHANGED: reconcile the existing operation' using errcode = 'PT409';
    end if;
    return (v_claim -> 'result') || jsonb_build_object('replayed',true);
  end if;

  select * into v_current from public.editions where id = p_edition_id for update;
  if not found then raise exception 'Edition not found' using errcode = 'P0002'; end if;
  for v_key in select jsonb_object_keys(p_expected) loop
    if (to_jsonb(v_current) -> v_key) is distinct from (p_expected -> v_key) then
      raise exception 'STATE_CHANGED: reviewed edition visual state is stale' using errcode = 'PT409';
    end if;
  end loop;
  v_next := jsonb_populate_record(v_current,p_patch);
  update public.editions
  set theme_colors=v_next.theme_colors,
      data_revision=data_revision + 1
  where id=p_edition_id and data_revision = (p_expected ->> 'data_revision')::bigint
  returning * into v_next;

  select coalesce(jsonb_agg(to_jsonb(key) order by key), '[]'::jsonb)
  into v_changed_fields
  from jsonb_object_keys(p_patch) as fields(key);

  insert into public.studio2_contest_events(edition_id,type,actor_user_id,entity_type,entity_id,payload)
    values(p_edition_id,'edition.metadata_changed',v_actor,'edition',p_edition_id::text,
      jsonb_build_object('changeKind','edition.visual.change','operationId',v_operation_id,
        'changedFields',v_changed_fields,'fromRevision',v_current.data_revision,
        'toRevision',v_next.data_revision,'reason',p_reason));
  perform private.v3_emit_domain_event('edition.changed','edition',p_edition_id::text,v_next.data_revision,
    v_operation_id,p_edition_id,null,jsonb_build_object('changeKind','visual',
      'changedFields',v_changed_fields,'previousRevision',v_current.data_revision,
      'revision',v_next.data_revision),1,array[]::text[]);
  v_result := jsonb_build_object('ok',true,'edition',to_jsonb(v_next),'operationId',v_operation_id,'replayed',false,'changed',true);
  return private.studio2_complete_operation(v_operation_id,v_result);
end
$command$;

revoke all on function public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)
  from public, anon, service_role;
grant execute on function public.v3_apply_edition_visual_change(uuid,jsonb,jsonb,text)
  to authenticated;


notify pgrst,'reload schema';
commit;
