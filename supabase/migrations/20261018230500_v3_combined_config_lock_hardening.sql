begin;

-- System V3 / #927 concurrency hardening.
--
-- Legacy source/value/participant writers lock child rows before their
-- invalidation trigger touches the aggregation. Canonical V3 commands may
-- already own the aggregation CAS row when they replace children. Waiting here
-- would allow a child<->parent deadlock. Acquire the aggregate row NOWAIT and
-- turn the collision into a deterministic retry-after-refresh conflict instead.

create or replace function private.v3_touch_combined_configuration(
  p_aggregation_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, televoting, private
as $touch$
begin
  if p_aggregation_id is null then
    return;
  end if;

  begin
    perform 1
    from televoting.televote_aggregations aggregation
    where aggregation.id = p_aggregation_id
    for update nowait;
  exception
    when lock_not_available then
      raise exception using
        errcode = 'PT409',
        message = 'VERSION_CONFLICT',
        detail = 'Combined configuration changed concurrently; refresh before retrying.';
  end;

  update televoting.televote_aggregations aggregation
  set
    config_version = aggregation.config_version + 1,
    results_outdated = case
      when aggregation.calculation_version > 0 then true
      else aggregation.results_outdated
    end
  where aggregation.id = p_aggregation_id;
end
$touch$;

revoke all on function private.v3_touch_combined_configuration(uuid)
  from public, anon, authenticated;

commit;
