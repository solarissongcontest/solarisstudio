begin;

-- System V3 / Public Results analysis authority.
--
-- Public analysis tools need one publication-safe immutable result identity.
-- They must not derive that identity from mutable results rows, timestamps,
-- browser state or publication-control internals. The canonical published
-- result version remains studio2_show_publication_controls.source_result_version,
-- backed by immutable private.v3_result_versions evidence.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.public-result-analysis-context',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive publication-safe read projection over canonical Show publication and immutable Result Version evidence. Hidden, scheduled, unpublished and legacy unversioned outcomes fail closed.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function public.v3_public_result_analysis_context(
  p_show_id uuid,
  p_result_version_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $context$
declare
  v_show public.shows%rowtype;
  v_edition public.editions%rowtype;
  v_control public.studio2_show_publication_controls%rowtype;
  v_version private.v3_result_versions%rowtype;
  v_version_id text;
  v_server_time timestamptz := now();
  v_unavailable jsonb;
begin
  -- Deliberately use one generic unavailable shape. A caller may probe a show
  -- id, but must not learn whether the failure was non-existence, an unpublished
  -- edition, Draft/Scheduled/Hidden state, missing provenance or invalid result
  -- evidence. This keeps anonymous/authenticated/Organizer public reads equal.
  v_unavailable := jsonb_build_object(
    'schemaVersion', 1,
    'available', false,
    'showId', p_show_id,
    'editionId', null,
    'resultVersionId', null,
    'resultVersion', null,
    'publicationVersion', null,
    'isCurrentPublicVersion', false,
    'requestedVersionIsCurrent', case
      when p_result_version_id is null then null
      else false
    end,
    'publishedAt', null,
    'serverTime', v_server_time
  );

  if p_show_id is null then
    return v_unavailable;
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show.id is null then
    return v_unavailable;
  end if;

  select edition_row.*
  into v_edition
  from public.editions edition_row
  where edition_row.id = v_show.edition_id;

  if v_edition.id is null or not coalesce(v_edition.published, false) then
    return v_unavailable;
  end if;

  select control.*
  into v_control
  from public.studio2_show_publication_controls control
  where control.show_id = v_show.id
    and control.edition_id = v_show.edition_id;

  -- Scheduled intentionally fails closed even when it was scheduled from a
  -- currently-public projection. Until the canonical control returns to Public,
  -- analysis consumers do not guess which version should own provenance.
  if v_control.show_id is null
     or v_control.state <> 'public'
     or not coalesce(v_show.published, false)
     or v_control.source_result_version is null
     or not coalesce(
       (private.studio2_normalise_publication_config(v_control.frozen_config) ->> 'results')::boolean,
       false
     )
     or not coalesce(
       (private.studio2_normalise_publication_config(v_show.publication_config) ->> 'results')::boolean,
       false
     ) then
    return v_unavailable;
  end if;

  select result_version.*
  into v_version
  from private.v3_result_versions result_version
  where result_version.show_id = v_show.id
    and result_version.edition_id = v_show.edition_id
    and result_version.version = v_control.source_result_version;

  if v_version.show_id is null
     or not private.v3_publication_result_version_release_ready(
       v_show.id,
       v_control.source_result_version
     ) then
    return v_unavailable;
  end if;

  -- The immutable database identity is (show_id, version). Expose it as one
  -- stable namespaced token so Public tools can compare/deep-link provenance
  -- without receiving private snapshot rows.
  v_version_id := format(
    'result-version:%s:%s',
    v_show.id,
    v_control.source_result_version
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'available', true,
    'editionId', v_show.edition_id,
    'showId', v_show.id,
    'resultVersionId', v_version_id,
    'resultVersion', v_control.source_result_version,
    'publicationVersion', v_control.version,
    'isCurrentPublicVersion', true,
    'requestedVersionIsCurrent', case
      when p_result_version_id is null then null
      else p_result_version_id = v_version_id
    end,
    'publishedAt', v_control.updated_at,
    'serverTime', v_server_time
  );
end
$context$;

revoke all on function public.v3_public_result_analysis_context(uuid, text)
  from public;
grant execute on function public.v3_public_result_analysis_context(uuid, text)
  to anon, authenticated, service_role;

comment on function public.v3_public_result_analysis_context(uuid, text)
is 'Publication-safe V3 Result Analysis Context. Resolves only the exact immutable Result Version currently owned by canonical public Show publication; all non-public or unversioned states return the same unavailable shape.';

notify pgrst, 'reload schema';

commit;
