begin;

-- Permission Engine v2 cutover batch 18.
--
-- friend_voting_historical_country_payload is a large read-only analytics RPC.
-- Preserve its current analytics implementation exactly by rewriting only the
-- known legacy Organizer authorization clause from PostgreSQL's canonical
-- function definition. Fail closed if the expected source clause is absent or
-- if the rewritten body does not verify cleanly.

do $cutover$
declare
  v_oid oid;
  v_before text;
  v_after text;
  v_legacy text := E'  if coalesce(auth.role(), \'\') <> \'service_role\'\n     and (auth.uid() is null or not public.has_role(auth.uid(), \'organizer\'::public.app_role)) then';
  v_replacement text := E'  if coalesce(auth.role(), \'\') <> \'service_role\'\n     and (auth.uid() is null or not public.studio2_access_allowed(\'voting.read\', p_edition_id, false)) then';
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname = 'friend_voting_historical_country_payload'
    and pg_get_function_identity_arguments(p.oid) = 'p_channel text, p_edition_id uuid, p_limit integer';

  if v_oid is null then
    raise exception 'friend_voting_historical_country_payload(text, uuid, integer) is missing'
      using errcode = '42883';
  end if;

  select pg_get_functiondef(v_oid) into v_before;

  if strpos(v_before, v_legacy) = 0 then
    raise exception 'friend-voting authorization source clause drifted; refusing cutover'
      using errcode = 'P0001';
  end if;

  v_after := replace(v_before, v_legacy, v_replacement);

  if v_after = v_before then
    raise exception 'friend-voting authorization rewrite made no change'
      using errcode = 'P0001';
  end if;

  execute v_after;

  select pg_get_functiondef(p.oid)
  into v_after
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.proname = 'friend_voting_historical_country_payload'
    and pg_get_function_identity_arguments(p.oid) = 'p_channel text, p_edition_id uuid, p_limit integer';

  if v_after ilike '%public.has_role(%' then
    raise exception 'friend-voting authorization cutover still contains public.has_role'
      using errcode = 'P0001';
  end if;

  if v_after not ilike '%public.studio2_access_allowed(''voting.read'', p_edition_id, false)%' then
    raise exception 'friend-voting authorization cutover is missing voting.read shared access'
      using errcode = 'P0001';
  end if;
end
$cutover$;

revoke all on function public.friend_voting_historical_country_payload(text, uuid, integer)
  from public, anon;
grant execute on function public.friend_voting_historical_country_payload(text, uuid, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
