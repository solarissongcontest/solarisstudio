begin;

select public.v3_register_migration_contract(
  'v3.public.published-result-snapshot-batch', 1, 'forward_fix_only', false, null,
  'Bounded public batch transport for canonical immutable published result snapshots'
);

-- Transport only: the existing single-show projection remains the sole
-- Publication/version/privacy authority. INVOKER needs no private-table grant.
create or replace function public.v3_public_published_result_snapshots(p_show_ids uuid[], p_include_rows boolean default true)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $batch$
begin
  if p_include_rows is null or p_show_ids is null or cardinality(p_show_ids) > 100
     or coalesce(array_ndims(p_show_ids), 1) <> 1
     or array_position(p_show_ids, null) is not null then
    raise exception 'Expected at most 100 non-null show IDs' using errcode = '22023';
  end if;
  return (
    with requested as (
      select id, min(ordinality) as position
      from unnest(p_show_ids) with ordinality as requested_show(id, ordinality)
      group by id
    ), snapshots as materialized (
      select position, public.v3_public_published_result_snapshot(id) as snapshot
      from requested
    )
    select coalesce(jsonb_agg(case when p_include_rows then snapshot else
      (snapshot - 'rows') || jsonb_build_object('winners', (
        select coalesce(jsonb_agg(row_value - 'televoteComponents'),'[]'::jsonb)
        from jsonb_array_elements(snapshot->'rows') row_item(row_value)
        where row_value->>'finalRank'='1'
      )) end order by position) filter (where snapshot is not null), '[]'::jsonb)
    from snapshots
  );
end
$batch$;
revoke all on function public.v3_public_published_result_snapshots(uuid[],boolean) from public, anon, authenticated;
grant execute on function public.v3_public_published_result_snapshots(uuid[],boolean) to anon, authenticated, service_role;
comment on function public.v3_public_published_result_snapshots(uuid[],boolean) is
  'Bounded read-only transport. Deduplicates at most 100 requested shows; includes only canonical public exact-version snapshots. No mutable Results fallback.';
notify pgrst, 'reload schema';
commit;
