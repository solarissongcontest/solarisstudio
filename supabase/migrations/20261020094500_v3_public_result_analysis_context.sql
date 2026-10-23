begin;

-- System V3 / Public Results: publication-safe immutable Result Version context.
--
-- Public analysis tools need one stable context identity without learning
-- private Result Version rows or independently interpreting publication state.
-- This resolver exposes only the current *public* immutable version pointer and
-- an opaque deterministic identity. A caller may compare a previously observed
-- opaque identity with the current publication without probing historical
-- private version existence.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.public-result-analysis-context-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive read-only publication-safe Result Analysis Context over canonical publication controls and immutable Result Version evidence.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function private.v3_public_result_version_identity(
  p_edition_id uuid,
  p_show_id uuid,
  p_result_version bigint
)
returns text
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $identity$
  select 'rv1_' || encode(
    extensions.digest(
      convert_to(
        'v1:' || p_edition_id::text || ':' || p_show_id::text || ':' || p_result_version::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$identity$;

revoke all on function private.v3_public_result_version_identity(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function private.v3_public_result_version_identity(uuid, uuid, bigint)
  to service_role;

create or replace function public.v3_public_result_analysis_context(
  p_edition_id uuid,
  p_show_id uuid,
  p_seen_result_version_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $context$
declare
  v_seen text := nullif(lower(btrim(coalesce(p_seen_result_version_id, ''))), '');
  v_source_version bigint;
  v_result_row_count integer;
  v_identity text;
  v_server_time timestamptz := now();
begin
  if p_edition_id is null or p_show_id is null then
    raise exception 'Edition and show are required' using errcode = '22023';
  end if;

  if v_seen is not null and v_seen !~ '^rv1_[0-9a-f]{64}$' then
    raise exception 'Seen Result Version identity is invalid' using errcode = '22023';
  end if;

  -- Exact route/context binding comes first. Never silently substitute an
  -- active/latest edition or accept a show from another edition.
  if not exists (
    select 1
    from public.shows show_row
    where show_row.id = p_show_id
      and show_row.edition_id = p_edition_id
  ) then
    raise exception 'Result Analysis Context scope mismatch' using errcode = '42501';
  end if;

  -- Publication controls are canonical public visibility authority. The join
  -- to immutable evidence proves the public pointer names a real exact Result
  -- Version, but no private snapshot contents are exposed by this function.
  select
    control.source_result_version,
    version_row.result_row_count
  into
    v_source_version,
    v_result_row_count
  from public.studio2_show_publication_controls control
  join private.v3_result_versions version_row
    on version_row.show_id = control.show_id
   and version_row.edition_id = control.edition_id
   and version_row.version = control.source_result_version
  where control.show_id = p_show_id
    and control.edition_id = p_edition_id
    and control.state = 'public'
    and control.source_result_version is not null
    and coalesce((control.frozen_config ->> 'results')::boolean, false)
  limit 1;

  -- Hidden, scheduled, draft, result-disabled and missing-evidence states are
  -- intentionally indistinguishable to the public caller. Previously observed
  -- version ids cannot be used as an oracle for private historical versions.
  if v_source_version is null then
    return jsonb_build_object(
      'schemaVersion', 1,
      'available', false,
      'editionId', p_edition_id,
      'showId', p_show_id,
      'reason', 'results_unavailable',
      'currentPublic', false,
      'seenResultVersionIsCurrent', case when v_seen is null then null else false end,
      'serverTime', v_server_time
    );
  end if;

  v_identity := private.v3_public_result_version_identity(
    p_edition_id,
    p_show_id,
    v_source_version
  );

  return jsonb_build_object(
    'schemaVersion', 1,
    'available', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'resultVersion', v_source_version,
    'resultVersionId', v_identity,
    'resultRowCount', v_result_row_count,
    'currentPublic', true,
    'seenResultVersionIsCurrent', case
      when v_seen is null then null
      else v_seen = v_identity
    end,
    'serverTime', v_server_time
  );
end
$context$;

revoke all on function public.v3_public_result_analysis_context(uuid, uuid, text)
  from public;
grant execute on function public.v3_public_result_analysis_context(uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function public.v3_public_result_analysis_context(uuid, uuid, text) is
  'Public Results analysis context. Resolves only the currently public canonical immutable Result Version; hidden/scheduled/draft/missing evidence fails closed as generic unavailable. Auth state does not change public semantics.';

notify pgrst, 'reload schema';

commit;
