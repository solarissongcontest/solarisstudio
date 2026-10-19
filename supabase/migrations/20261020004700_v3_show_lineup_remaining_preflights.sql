begin;

select public.v3_register_migration_contract(
  'v3.show-lineup-remaining-preflights',
  1,
  'forward_fix_only',
  false,
  null,
  'Expose one permission-aware neutral line-up state preflight for governed member and entry-detail commands without client-owned version derivation.'
);

create or replace function public.v3_show_lineup_state_preflight(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_show public.shows%rowtype;
  v_state jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_state := private.v3_show_lineup_state_payload(p_show_id);
  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'showKind', v_show.kind,
    'lineupStage', v_show.lineup_stage,
    'stateVersion', private.v3_show_lineup_state_version(p_show_id),
    'participantCount', jsonb_array_length(v_state -> 'participants'),
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_show_lineup_state_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.v3_show_lineup_state_preflight(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
