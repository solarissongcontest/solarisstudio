begin;

-- System V3 / S12: collapse feature-rollout probes into one bounded Data API
-- request without changing the canonical per-flag authorization semantics.
--
-- This is intentionally an additive compatibility RPC. Existing callers of
-- studio2_feature_enabled(text, uuid) remain valid while V3 server projections
-- migrate to the bounded snapshot contract.
select public.v3_register_migration_contract(
  'v3.rollout.feature-flags-snapshot-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'S12 bounded feature flag snapshot for server rollout probes'
);

create or replace function public.studio2_feature_flags_snapshot(
  p_keys text[],
  p_edition_id uuid default null
)
returns table(flag_key text, enabled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key_count integer := coalesce(cardinality(p_keys), 0);
begin
  if v_key_count = 0 then
    return;
  end if;

  -- The V3 rollout probe currently needs far fewer than this. Keep a hard
  -- ceiling anyway so this convenience endpoint cannot become an unbounded
  -- feature-flag enumeration/query amplifier.
  if v_key_count > 50 then
    raise exception 'At most 50 feature flag keys may be evaluated per snapshot'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_keys) as requested(raw_key)
    where raw_key is null
       or btrim(raw_key) = ''
       or length(btrim(raw_key)) > 128
  ) then
    raise exception 'Feature flag snapshot keys must be non-empty and at most 128 characters'
      using errcode = '22023';
  end if;

  return query
  with normalized as (
    select btrim(requested.raw_key) as requested_key, requested.ordinality
    from unnest(p_keys) with ordinality as requested(raw_key, ordinality)
  ), deduped as (
    select normalized.requested_key, min(normalized.ordinality) as first_ordinality
    from normalized
    group by normalized.requested_key
  )
  select
    deduped.requested_key as flag_key,
    private.studio2_feature_enabled_for(
      auth.uid(),
      deduped.requested_key,
      p_edition_id
    ) as enabled
  from deduped
  order by deduped.first_ordinality;
end
$$;

revoke all on function public.studio2_feature_flags_snapshot(text[], uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_feature_flags_snapshot(text[], uuid)
  to anon, authenticated, service_role;

comment on function public.studio2_feature_flags_snapshot(text[], uuid) is
  'Bounded V3 feature-rollout boolean snapshot. Reuses canonical per-flag authorization and exposes no rollout metadata.';

notify pgrst, 'reload schema';

commit;
