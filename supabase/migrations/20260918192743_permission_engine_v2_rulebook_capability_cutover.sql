begin;

-- Permission Engine v2 cutover batch 24.
--
-- Rulebook administration still funnels through the semantic legacy helper
-- public.rulebook_is_organizer(). Replace that shared Organizer gate at each
-- live RPC with the capability that matches the operation, then retire the
-- helper entirely. Non-strict checks preserve legacy Organizer compatibility
-- while permission_engine_v2 remains disabled and become capability-only after
-- the authoritative cutover.

do $cutover$
declare
  v_target record;
  v_oid oid;
  v_def text;
  v_new_def text;
  v_legacy_occurrences integer;
begin
  for v_target in
    select *
    from (values
      ('public.admin_rulebook_releases()', 'rules.read'),
      ('public.admin_archive_rulebook_release(uuid)', 'rules.edit'),
      ('public.admin_create_rulebook_release(text,text,text,text)', 'rules.edit'),
      ('public.admin_delete_rulebook_change(uuid,text)', 'rules.edit'),
      ('public.admin_upsert_rulebook_change(uuid,text,text,jsonb,jsonb,text)', 'rules.edit'),
      ('public.admin_publish_rulebook_release(uuid,timestamp with time zone)', 'rules.publish')
    ) as mapped(signature, capability)
  loop
    v_oid := to_regprocedure(v_target.signature);
    if v_oid is null then
      raise exception 'Rulebook cutover target missing: %', v_target.signature;
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_legacy_occurrences := (
      length(v_def) - length(replace(v_def, 'public.rulebook_is_organizer()', ''))
    ) / length('public.rulebook_is_organizer()');

    if v_legacy_occurrences <> 1 then
      raise exception 'Expected exactly one rulebook_is_organizer gate in %, found %',
        v_target.signature, v_legacy_occurrences;
    end if;

    v_new_def := replace(
      v_def,
      'public.rulebook_is_organizer()',
      format('public.studio2_access_allowed(%L, null, false)', v_target.capability)
    );

    if v_new_def = v_def then
      raise exception 'Rulebook capability rewrite was a no-op for %', v_target.signature;
    end if;

    execute v_new_def;
  end loop;
end
$cutover$;

-- Verify the six live RPCs now carry the intended capability and no longer
-- reference the semantic Organizer helper.
do $verify$
declare
  v_target record;
  v_oid oid;
  v_def text;
begin
  for v_target in
    select *
    from (values
      ('public.admin_rulebook_releases()', 'rules.read'),
      ('public.admin_archive_rulebook_release(uuid)', 'rules.edit'),
      ('public.admin_create_rulebook_release(text,text,text,text)', 'rules.edit'),
      ('public.admin_delete_rulebook_change(uuid,text)', 'rules.edit'),
      ('public.admin_upsert_rulebook_change(uuid,text,text,jsonb,jsonb,text)', 'rules.edit'),
      ('public.admin_publish_rulebook_release(uuid,timestamp with time zone)', 'rules.publish')
    ) as mapped(signature, capability)
  loop
    v_oid := to_regprocedure(v_target.signature);
    v_def := pg_get_functiondef(v_oid);

    if v_def ilike '%rulebook_is_organizer%' then
      raise exception 'Legacy rulebook helper still referenced by %', v_target.signature;
    end if;

    if position(
      format('public.studio2_access_allowed(%L, null, false)', v_target.capability)
      in v_def
    ) = 0 then
      raise exception 'Expected capability % missing from %', v_target.capability, v_target.signature;
    end if;
  end loop;
end
$verify$;

-- All live callers are migrated. The helper itself is now obsolete and keeping
-- it executable would preserve an unnecessary Organizer-only SECURITY DEFINER
-- RPC surface.
drop function public.rulebook_is_organizer();

-- Preserve the existing RPC ACL boundary explicitly for the six public admin
-- functions: authenticated + service role, never anon.
revoke all on function public.admin_rulebook_releases() from public, anon;
grant execute on function public.admin_rulebook_releases() to authenticated, service_role;

revoke all on function public.admin_archive_rulebook_release(uuid) from public, anon;
grant execute on function public.admin_archive_rulebook_release(uuid) to authenticated, service_role;

revoke all on function public.admin_create_rulebook_release(text,text,text,text) from public, anon;
grant execute on function public.admin_create_rulebook_release(text,text,text,text) to authenticated, service_role;

revoke all on function public.admin_delete_rulebook_change(uuid,text) from public, anon;
grant execute on function public.admin_delete_rulebook_change(uuid,text) to authenticated, service_role;

revoke all on function public.admin_upsert_rulebook_change(uuid,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.admin_upsert_rulebook_change(uuid,text,text,jsonb,jsonb,text) to authenticated, service_role;

revoke all on function public.admin_publish_rulebook_release(uuid,timestamp with time zone) from public, anon;
grant execute on function public.admin_publish_rulebook_release(uuid,timestamp with time zone) to authenticated, service_role;

-- Fail closed if any live function still references the retired helper.
do $final_verify$
declare
  v_remaining bigint;
begin
  if to_regprocedure('public.rulebook_is_organizer()') is not null then
    raise exception 'rulebook_is_organizer helper still exists after retirement';
  end if;

  select count(*) into v_remaining
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and n.nspname in ('public', 'private', 'televoting')
    and pg_get_functiondef(p.oid) ilike '%rulebook_is_organizer%';

  if v_remaining <> 0 then
    raise exception 'Live rulebook semantic Organizer references remain: %', v_remaining;
  end if;
end
$final_verify$;

notify pgrst, 'reload schema';

commit;
