-- Reusing a publication control must not attempt a second initialization.
-- Existing immutable provenance, version, authorization and command CAS stay
-- unchanged. This repairs retained-control initialization, not stale CAS replay.
begin;

select public.v3_register_migration_contract(
  'v3.publication.retained-control-initialization', 1, 'forward_fix_only',
  false, null,
  'Reuse retained publication controls before INSERT so repeated commands preserve exact immutable result provenance without bypassing guards or CAS.'
);

create or replace function private.studio2_ensure_show_publication_control(
  p_show_id uuid
)
returns public.studio2_show_publication_controls
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $ensure$
declare
  v_show public.shows;
  v_control public.studio2_show_publication_controls;
begin
  select *
  into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  -- Return retained provenance before attempting INSERT. BEFORE INSERT
  -- publication guards run even when ON CONFLICT would discard the row;
  -- a synthesized public row has no immutable source_result_version.
  select *
  into v_control
  from public.studio2_show_publication_controls
  where show_id = p_show_id;

  if found then
    return v_control;
  end if;

  insert into public.studio2_show_publication_controls (
    show_id,
    edition_id,
    state,
    frozen_config,
    source_show_updated_at
  )
  values (
    v_show.id,
    v_show.edition_id,
    case
      when v_show.published
        and private.studio2_publication_has_any(v_show.publication_config)
      then 'public'
      else 'draft'
    end,
    private.studio2_normalise_publication_config(v_show.publication_config),
    v_show.updated_at
  )
  on conflict (show_id) do nothing;

  select *
  into v_control
  from public.studio2_show_publication_controls
  where show_id = p_show_id;

  return v_control;
end
$ensure$;

revoke all on function private.studio2_ensure_show_publication_control(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
