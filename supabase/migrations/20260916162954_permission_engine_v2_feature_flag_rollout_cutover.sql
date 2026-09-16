begin;

-- Permission Engine v2 cutover batch 16.
--
-- Feature rollout mutation already validates the union of existing and requested
-- edition scopes. Replace its private capability checks plus separate Organizer
-- bypass with the shared non-strict rollout.manage predicate. Before cutover this
-- preserves Organizer OR capability semantics; after cutover only explicit
-- rollout.manage remains authoritative.

create or replace function public.studio2_set_feature_flag(
  p_key text,
  p_enabled boolean,
  p_admins_only boolean default false,
  p_user_ids uuid[] default '{}'::uuid[],
  p_edition_ids uuid[] default '{}'::uuid[]
)
returns public.studio2_feature_flags
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_can_manage_scopes boolean := false;
  v_existing_scopes uuid[];
  v_requested_scopes uuid[] := coalesce(p_edition_ids, '{}'::uuid[]);
  v_row public.studio2_feature_flags%rowtype;
begin
  if p_key is null then
    raise exception 'Feature flag key is required' using errcode = '22023';
  end if;
  if array_position(coalesce(p_user_ids, '{}'::uuid[]), null) is not null
     or array_position(coalesce(p_edition_ids, '{}'::uuid[]), null) is not null then
    raise exception 'Feature flag scopes may not contain null identifiers' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2_feature_flag:' || p_key, 0));

  select edition_ids
  into v_existing_scopes
  from public.studio2_feature_flags
  where key = p_key
  for update;

  if (found and cardinality(v_existing_scopes) = 0)
     or cardinality(v_requested_scopes) = 0 then
    v_can_manage_scopes := public.studio2_access_allowed('rollout.manage', null, false);
  else
    v_can_manage_scopes := not exists (
      select 1
      from (
        select distinct edition_id
        from unnest(coalesce(v_existing_scopes, '{}'::uuid[]) || v_requested_scopes)
          edition_scope(edition_id)
      ) affected_scope
      where not public.studio2_access_allowed('rollout.manage', affected_scope.edition_id, false)
    );
  end if;

  if not v_is_service
     and not v_can_manage_scopes then
    raise exception 'Feature rollout management capability required for every existing and requested edition scope'
      using errcode = '42501';
  end if;

  insert into public.studio2_feature_flags (
    key, enabled, admins_only, user_ids, edition_ids, updated_by
  ) values (
    p_key,
    coalesce(p_enabled, false),
    coalesce(p_admins_only, false),
    coalesce(p_user_ids, '{}'::uuid[]),
    coalesce(p_edition_ids, '{}'::uuid[]),
    v_actor
  )
  on conflict (key) do update set
    enabled = excluded.enabled,
    admins_only = excluded.admins_only,
    user_ids = excluded.user_ids,
    edition_ids = excluded.edition_ids,
    updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[])
  from public, anon;
grant execute on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[])
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
