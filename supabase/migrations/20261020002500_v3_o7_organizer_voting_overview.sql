begin;

select public.v3_register_migration_contract(
  'v3.o7.organizer-voting-overview',
  1,
  'forward_fix_only',
  false,
  null,
  'Add one exact-edition Organizer Voting read projection across canonical Jury state, the existing Televote summary, explicit voting-integrity attention, and a canonical Results authority reference.'
);

create or replace function public.studio2_organizer_voting_overview(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $overview$
declare
  v_edition public.editions;
  v_televote jsonb := '{}'::jsonb;
  v_show_summaries jsonb := '[]'::jsonb;
  v_show_count integer := 0;
  v_enabled_show_count integer := 0;
  v_configured_show_count integer := 0;
  v_unconfigured_show_count integer := 0;
  v_expected integer := 0;
  v_submitted integer := 0;
  v_valid integer := 0;
  v_needs_review integer := 0;
  v_invalidated integer := 0;
  v_superseded integer := 0;
  v_did_not_vote integer := 0;
  v_missing integer := 0;
  v_open_windows integer := 0;
  v_jury_blockers integer := 0;
  v_televote_blocked integer := 0;
  v_integrity_outstanding integer := 0;
  v_recommended_action jsonb := null;
  v_core jsonb;
  v_state_version text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_edition_id is null then
    raise exception 'Explicit Organizer edition is required' using errcode = '22023';
  end if;

  select *
  into v_edition
  from public.editions edition
  where edition.id = p_edition_id;

  if v_edition.id is null then
    raise exception 'Edition not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('voting.read', p_edition_id, true) then
    raise exception 'Missing Solaris capability: voting.read' using errcode = '42501';
  end if;

  -- Public-vote lifecycle/count semantics already have one canonical exact-edition
  -- projection. Reuse it rather than rebuilding them inside this Organizer view.
  v_televote := coalesce(
    televoting.admin_overview_summary(p_edition_id),
    '{}'::jsonb
  );

  with show_scope as (
    select
      show_row.id,
      show_row.name,
      show_row.kind,
      show_row.sort_order,
      show_row.status,
      show_row.voting_config,
      show_row.updated_at,
      coalesce((show_row.voting_config ->> 'juryEnabled')::boolean, true) as jury_enabled,
      coalesce(jury_window.status, 'closed') as window_status,
      jury_window.updated_at as window_updated_at
    from public.shows show_row
    left join public.jury_voting_windows jury_window
      on jury_window.show_id = show_row.id
     and jury_window.edition_id = p_edition_id
    where show_row.edition_id = p_edition_id
  ),
  per_show as (
    select
      show_scope.id,
      show_scope.name,
      show_scope.kind,
      show_scope.sort_order,
      show_scope.status,
      show_scope.jury_enabled,
      show_scope.window_status,
      show_scope.updated_at,
      show_scope.window_updated_at,
      coalesce(voter_stats.expected_count, 0)::integer as expected_count,
      coalesce(ballot_stats.submitted_count, 0)::integer as submitted_count,
      coalesce(ballot_stats.valid_count, 0)::integer as valid_count,
      coalesce(ballot_stats.needs_review_count, 0)::integer as needs_review_count,
      coalesce(ballot_stats.invalidated_count, 0)::integer as invalidated_count,
      coalesce(ballot_stats.superseded_count, 0)::integer as superseded_count,
      coalesce(dnv_stats.did_not_vote_count, 0)::integer as did_not_vote_count,
      coalesce(voter_stats.missing_count, 0)::integer as missing_count,
      greatest(
        coalesce(ballot_stats.max_review_version, 0),
        coalesce(dnv_stats.max_status_version, 0)
      )::bigint as review_version
    from show_scope
    left join lateral (
      select
        count(*)::integer as expected_count,
        count(*) filter (
          where not exists (
            select 1
            from public.jury_ballot_submissions ballot
            where ballot.show_id = show_scope.id
              and ballot.edition_id = p_edition_id
              and ballot.status <> 'superseded'
              and (
                ballot.voter_id = voter.id
                or (
                  ballot.voter_id is null
                  and voter.contest_entity_id is not null
                  and ballot.voter_entity_id = voter.contest_entity_id
                )
                or (
                  ballot.voter_id is null
                  and ballot.voter_entity_id is null
                  and voter.country_id is not null
                  and ballot.voter_country_id = voter.country_id
                )
              )
          )
          and not exists (
            select 1
            from public.jury_ballot_statuses status_row
            where status_row.show_id = show_scope.id
              and status_row.edition_id = p_edition_id
              and status_row.status = 'did_not_vote'
              and (
                status_row.voter_id = voter.id
                or (
                  status_row.voter_id is null
                  and voter.contest_entity_id is not null
                  and status_row.voter_entity_id = voter.contest_entity_id
                )
                or (
                  status_row.voter_id is null
                  and status_row.voter_entity_id is null
                  and voter.country_id is not null
                  and status_row.voter_country_id = voter.country_id
                )
              )
          )
        )::integer as missing_count
      from public.voters voter
      where voter.show_id = show_scope.id
        and voter.edition_id = p_edition_id
    ) voter_stats on true
    left join lateral (
      select
        count(*) filter (where ballot.status = 'submitted')::integer as submitted_count,
        count(*) filter (where ballot.status = 'valid')::integer as valid_count,
        count(*) filter (where ballot.status = 'needs_review')::integer as needs_review_count,
        count(*) filter (where ballot.status = 'invalidated')::integer as invalidated_count,
        count(*) filter (where ballot.status = 'superseded')::integer as superseded_count,
        max(ballot.review_version)::bigint as max_review_version
      from public.jury_ballot_submissions ballot
      where ballot.show_id = show_scope.id
        and ballot.edition_id = p_edition_id
    ) ballot_stats on true
    left join lateral (
      select
        count(*) filter (where status_row.status = 'did_not_vote')::integer as did_not_vote_count,
        max(status_row.version)::bigint as max_status_version
      from public.jury_ballot_statuses status_row
      where status_row.show_id = show_scope.id
        and status_row.edition_id = p_edition_id
    ) dnv_stats on true
  ),
  aggregate as (
    select
      count(*)::integer as show_count,
      count(*) filter (where jury_enabled)::integer as enabled_show_count,
      count(*) filter (where jury_enabled and expected_count > 0)::integer as configured_show_count,
      count(*) filter (where jury_enabled and expected_count = 0)::integer as unconfigured_show_count,
      coalesce(sum(case when jury_enabled then expected_count else 0 end), 0)::integer as expected_count,
      coalesce(sum(case when jury_enabled then submitted_count else 0 end), 0)::integer as submitted_count,
      coalesce(sum(case when jury_enabled then valid_count else 0 end), 0)::integer as valid_count,
      coalesce(sum(case when jury_enabled then needs_review_count else 0 end), 0)::integer as needs_review_count,
      coalesce(sum(case when jury_enabled then invalidated_count else 0 end), 0)::integer as invalidated_count,
      coalesce(sum(case when jury_enabled then superseded_count else 0 end), 0)::integer as superseded_count,
      coalesce(sum(case when jury_enabled then did_not_vote_count else 0 end), 0)::integer as did_not_vote_count,
      coalesce(sum(case when jury_enabled then missing_count else 0 end), 0)::integer as missing_count,
      count(*) filter (where jury_enabled and window_status = 'open')::integer as open_windows,
      coalesce(sum(
        case
          when not jury_enabled then 0
          when expected_count = 0 then 1
          else needs_review_count
            + invalidated_count
            + case when window_status = 'open' then missing_count else 0 end
        end
      ), 0)::integer as blocker_count
    from per_show
  ),
  bounded_shows as (
    select *
    from per_show
    order by sort_order nulls last, lower(name), id
    limit 64
  )
  select
    aggregate.show_count,
    aggregate.enabled_show_count,
    aggregate.configured_show_count,
    aggregate.unconfigured_show_count,
    aggregate.expected_count,
    aggregate.submitted_count,
    aggregate.valid_count,
    aggregate.needs_review_count,
    aggregate.invalidated_count,
    aggregate.superseded_count,
    aggregate.did_not_vote_count,
    aggregate.missing_count,
    aggregate.open_windows,
    aggregate.blocker_count,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'showId', bounded.id,
          'showName', bounded.name,
          'showKind', bounded.kind,
          'showStatus', bounded.status,
          'juryEnabled', bounded.jury_enabled,
          'configured', bounded.jury_enabled and bounded.expected_count > 0,
          'windowStatus', bounded.window_status,
          'expected', case when bounded.jury_enabled then bounded.expected_count else 0 end,
          'submitted', case when bounded.jury_enabled then bounded.submitted_count else 0 end,
          'valid', case when bounded.jury_enabled then bounded.valid_count else 0 end,
          'needsReview', case when bounded.jury_enabled then bounded.needs_review_count else 0 end,
          'invalidated', case when bounded.jury_enabled then bounded.invalidated_count else 0 end,
          'superseded', case when bounded.jury_enabled then bounded.superseded_count else 0 end,
          'didNotVote', case when bounded.jury_enabled then bounded.did_not_vote_count else 0 end,
          'missing', case when bounded.jury_enabled then bounded.missing_count else 0 end,
          'blockers', case
            when not bounded.jury_enabled then 0
            when bounded.expected_count = 0 then 1
            else bounded.needs_review_count
              + bounded.invalidated_count
              + case when bounded.window_status = 'open' then bounded.missing_count else 0 end
          end,
          'reviewVersion', bounded.review_version
        )
        order by bounded.sort_order nulls last, lower(bounded.name), bounded.id
      )
      from bounded_shows bounded
    ), '[]'::jsonb)
  into
    v_show_count,
    v_enabled_show_count,
    v_configured_show_count,
    v_unconfigured_show_count,
    v_expected,
    v_submitted,
    v_valid,
    v_needs_review,
    v_invalidated,
    v_superseded,
    v_did_not_vote,
    v_missing,
    v_open_windows,
    v_jury_blockers,
    v_show_summaries
  from aggregate;

  v_televote_blocked := coalesce((v_televote ->> 'blocked')::integer, 0);
  v_integrity_outstanding := v_needs_review + v_invalidated + v_televote_blocked;

  if v_needs_review + v_invalidated > 0 then
    v_recommended_action := jsonb_build_object(
      'kind', 'jury.review',
      'label', 'Review Jury ballots',
      'route', '/admin/jury/' || v_edition.slug,
      'reason', (v_needs_review + v_invalidated)::text || ' Jury ballots need an Organizer decision'
    );
  elsif v_televote_blocked > 0 then
    v_recommended_action := jsonb_build_object(
      'kind', 'televote.integrity',
      'label', 'Review voting integrity',
      'route', '/televoting/admin/integrity',
      'reason', v_televote_blocked::text || ' public ballots are blocked'
    );
  elsif v_unconfigured_show_count > 0 then
    v_recommended_action := jsonb_build_object(
      'kind', 'jury.configure',
      'label', 'Configure Jury roster',
      'route', '/admin/jury/' || v_edition.slug,
      'reason', v_unconfigured_show_count::text || ' Jury-enabled show(s) have no configured voter roster'
    );
  elsif v_open_windows > 0 and v_missing > 0 then
    v_recommended_action := jsonb_build_object(
      'kind', 'jury.monitor',
      'label', 'Monitor Jury completion',
      'route', '/admin/jury/' || v_edition.slug,
      'reason', v_missing::text || ' expected Jury ballots remain unaccounted for while Jury voting is open'
    );
  elsif coalesce((v_televote ->> 'openRounds')::integer, 0) > 0 then
    v_recommended_action := jsonb_build_object(
      'kind', 'televote.monitor',
      'label', 'Monitor public voting',
      'route', '/televoting/admin/rounds',
      'reason', (v_televote ->> 'openRounds') || ' public voting round(s) are open'
    );
  end if;

  v_core := jsonb_build_object(
    'schemaVersion', 1,
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'slug', v_edition.slug,
      'name', v_edition.name,
      'editionNumber', v_edition.edition_number,
      'status', v_edition.status
    ),
    'jury', jsonb_build_object(
      'state', case
        when v_show_count = 0 or v_enabled_show_count = 0 then 'not_configured'
        when v_unconfigured_show_count > 0 or v_jury_blockers > 0 then 'attention'
        when v_open_windows > 0 then 'active'
        else 'ready'
      end,
      'showCount', v_show_count,
      'enabledShowCount', v_enabled_show_count,
      'configuredShowCount', v_configured_show_count,
      'unconfiguredShowCount', v_unconfigured_show_count,
      'showSummaryLimit', 64,
      'showSummaryTruncated', v_show_count > 64,
      'expected', v_expected,
      'submitted', v_submitted,
      'valid', v_valid,
      'needsReview', v_needs_review,
      'invalidated', v_invalidated,
      'superseded', v_superseded,
      'didNotVote', v_did_not_vote,
      'missing', v_missing,
      'openWindows', v_open_windows,
      'blockerCount', v_jury_blockers,
      'shows', v_show_summaries
    ),
    'televote', jsonb_build_object(
      'linked', coalesce((v_televote ->> 'linked')::boolean, false),
      'rounds', coalesce((v_televote ->> 'rounds')::integer, 0),
      'openRounds', coalesce((v_televote ->> 'openRounds')::integer, 0),
      'submissions', coalesce((v_televote ->> 'submissions')::integer, 0),
      'blocked', v_televote_blocked,
      'remoteEditionId', v_televote ->> 'remoteEditionId'
    ),
    'integrity', jsonb_build_object(
      'outstanding', v_integrity_outstanding,
      'juryNeedsReview', v_needs_review,
      'juryInvalidated', v_invalidated,
      'televoteBlocked', v_televote_blocked,
      'severity', case when v_integrity_outstanding > 0 then 'attention' else 'none' end
    ),
    'results', jsonb_build_object(
      'authority', 'organizer-results-projection',
      'route', '/admin/results',
      'note', 'Official result readiness/publication remains owned by the canonical Results projection and is not recomputed by Voting.'
    ),
    'recommendedAction', v_recommended_action
  );

  v_state_version := encode(
    extensions.digest(convert_to(v_core::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return v_core || jsonb_build_object(
    'stateVersion', v_state_version,
    'serverTime', now()
  );
end
$overview$;

revoke all on function public.studio2_organizer_voting_overview(uuid)
  from public, anon, service_role;
grant execute on function public.studio2_organizer_voting_overview(uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
