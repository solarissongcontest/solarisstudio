begin;

-- Keep the S14 projection-write bypass scoped to the exact withdrawal mutation.
-- Transaction-local settings are safe at commit, but later statements in the
-- same command should not inherit write authority they no longer need.
create or replace function private.v3_withdraw_combined_published_projection(
  p_edition_id uuid,
  p_aggregation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $withdraw$
declare
  v_source private.v3_televote_result_projection_sources%rowtype;
  v_deleted_rows integer := 0;
begin
  select source.*
  into v_source
  from private.v3_televote_result_projection_sources source
  where source.source_type = 'combined'
    and source.source_id = p_aggregation_id::text
  for update;

  if v_source.show_id is null then
    return jsonb_build_object(
      'withdrawn', false,
      'reason', 'not_current_projection_source'
    );
  end if;

  if v_source.edition_id is distinct from p_edition_id then
    raise exception using errcode = 'PT409', message = 'PROJECTION_SCOPE_CHANGED';
  end if;

  perform set_config('solaris.v3_televote_projection_write', '1', true);
  perform set_config('solaris.v3_televote_projection_bulk_replace', '1', true);

  delete from public.televote_votes vote
  where vote.show_id = v_source.show_id;
  get diagnostics v_deleted_rows = row_count;

  delete from private.v3_televote_result_projection_sources source
  where source.show_id = v_source.show_id
    and source.source_type = 'combined'
    and source.source_id = p_aggregation_id::text;

  perform set_config('solaris.v3_televote_projection_bulk_replace', '0', true);
  perform set_config('solaris.v3_televote_projection_write', '0', true);

  perform public.sync_show_results_from_votes(v_source.show_id);

  return jsonb_build_object(
    'withdrawn', true,
    'showId', v_source.show_id,
    'sourceVersion', v_source.source_version,
    'projectionRevision', v_source.projection_revision,
    'deletedVoteRows', v_deleted_rows
  );
end
$withdraw$;

revoke all on function private.v3_withdraw_combined_published_projection(uuid, uuid)
  from public, anon, authenticated;

commit;
