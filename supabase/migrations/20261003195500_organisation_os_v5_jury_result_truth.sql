begin;

-- Organisation OS V5 jury ballot lifecycle -> canonical Results truth.
--
-- Participant-linked jury votes count only while the immutable submission is
-- Valid. Manual Organizer-entered rows remain canonical when no submission id
-- exists. Review state changes immediately re-sync result totals without
-- deleting participant evidence.

create or replace function public.sync_show_results_from_votes(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_edition_id uuid;
  v_config jsonb;
  v_jury_scale integer[];
  v_top_score integer;
begin
  if _show_id is null then return; end if;

  select s.edition_id, coalesce(s.voting_config, '{}'::jsonb)
    into v_edition_id, v_config
  from public.shows s
  where s.id = _show_id;

  if v_edition_id is null then return; end if;

  select coalesce(array_agg(value::integer order by ord), array[]::integer[])
    into v_jury_scale
  from jsonb_array_elements_text(coalesce(v_config->'juryPoints', '[]'::jsonb))
       with ordinality as scale(value, ord);

  select coalesce(max(value), 12) into v_top_score
  from unnest(v_jury_scale) as value;

  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, p.country_id, p.contest_entity_id,
         0, 0, 0, null, now()
  from public.participants p
  where p.show_id = _show_id
    and p.country_id is not null
    and coalesce(p.participation_status, 'confirmed') = 'confirmed'
  on conflict (show_id, country_id) where show_id is not null
  do update set
    edition_id = excluded.edition_id,
    contest_entity_id = coalesce(public.results.contest_entity_id, excluded.contest_entity_id),
    updated_at = now();

  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, null, p.contest_entity_id,
         0, 0, 0, null, now()
  from public.participants p
  where p.show_id = _show_id
    and p.country_id is null
    and p.contest_entity_id is not null
    and coalesce(p.participation_status, 'confirmed') = 'confirmed'
  on conflict (show_id, contest_entity_id) where show_id is not null and contest_entity_id is not null
  do update set edition_id = excluded.edition_id, updated_at = now();

  update public.results r
  set final_rank = null,
      updated_at = now()
  where r.show_id = _show_id
    and not exists (
      select 1
      from public.participants p
      where p.show_id = _show_id
        and coalesce(p.participation_status, 'confirmed') = 'confirmed'
        and coalesce(p.country_id, p.contest_entity_id) = coalesce(r.country_id, r.contest_entity_id)
    );

  with jury_sums as (
    select coalesce(j.receiving_country_id, j.receiving_entity_id) as identity_id,
           sum(j.points)::integer as jury_points,
           count(*) filter (where j.points = v_top_score)::integer as top_scores
    from public.jury_votes j
    where j.show_id = _show_id
      and (
        j.ballot_submission_id is null
        or exists (
          select 1
          from public.jury_ballot_submissions submission
          where submission.id = j.ballot_submission_id
            and submission.status = 'valid'
        )
      )
      and (cardinality(v_jury_scale) = 0 or j.points = any(v_jury_scale))
    group by coalesce(j.receiving_country_id, j.receiving_entity_id)
  ),
  tele_sums as (
    select coalesce(t.country_id, t.contest_entity_id) as identity_id,
           sum(t.points)::integer as televote_points
    from public.televote_votes t
    where t.show_id = _show_id
    group by coalesce(t.country_id, t.contest_entity_id)
  ),
  scored as (
    select r.id,
           coalesce(r.country_id, r.contest_entity_id) as identity_id,
           r.final_rank as old_rank,
           coalesce(js.jury_points, 0)::integer as jury_points,
           coalesce(ts.televote_points, 0)::integer as televote_points,
           coalesce(js.top_scores, 0)::integer as top_scores,
           coalesce(p.running_order, -1)::integer as running_order
    from public.results r
    join public.participants p
      on p.show_id = _show_id
     and coalesce(p.participation_status, 'confirmed') = 'confirmed'
     and coalesce(p.country_id, p.contest_entity_id) = coalesce(r.country_id, r.contest_entity_id)
    left join jury_sums js
      on js.identity_id = coalesce(r.country_id, r.contest_entity_id)
    left join tele_sums ts
      on ts.identity_id = coalesce(r.country_id, r.contest_entity_id)
    where r.show_id = _show_id
  ),
  totals as (
    select s.*,
      case
        when coalesce((v_config->>'weightedScoring')::boolean, false) then
          round(
            s.jury_points * coalesce((v_config->'weighting'->>'jury')::numeric, 50) / 50
            + s.televote_points * coalesce((v_config->'weighting'->>'televote')::numeric, 50) / 50
          )::integer
        else s.jury_points + s.televote_points
      end as total_points
    from scored s
  ),
  keyed as (
    select t.*,
      coalesce(v_config->'tieBreak', '["televote","twelves","jury"]'::jsonb) as tie_break
    from totals t
  ),
  ranked as (
    select k.*,
      row_number() over (
        order by
          k.total_points desc,
          case coalesce(k.tie_break->>0, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>1, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>2, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>3, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>4, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          k.old_rank nulls last,
          k.identity_id
      )::integer as final_rank
    from keyed k
  )
  update public.results r
  set jury_points = ranked.jury_points,
      televote_points = ranked.televote_points,
      total_points = ranked.total_points,
      final_rank = ranked.final_rank,
      updated_at = now()
  from ranked
  where r.id = ranked.id;
end;
$$;

create or replace function public.materialize_show_results_if_missing(_show_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _edition_id uuid;
  _existing integer;
  _inserted integer := 0;
begin
  select edition_id into _edition_id from public.shows where id = _show_id;
  if _edition_id is null then return 0; end if;

  select count(*) into _existing from public.results where show_id = _show_id;
  if _existing > 0 then return 0; end if;

  with jury as (
    select coalesce(receiving_country_id, receiving_entity_id) as identity_id,
           sum(points)::integer as jury_points
    from public.jury_votes jury_vote
    where show_id = _show_id
      and (
        jury_vote.ballot_submission_id is null
        or exists (
          select 1
          from public.jury_ballot_submissions submission
          where submission.id = jury_vote.ballot_submission_id
            and submission.status = 'valid'
        )
      )
    group by coalesce(receiving_country_id, receiving_entity_id)
  ), tele as (
    select coalesce(country_id, contest_entity_id) as identity_id,
           sum(points)::integer as televote_points
    from public.televote_votes
    where show_id = _show_id
    group by coalesce(country_id, contest_entity_id)
  )
  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, p.country_id, p.contest_entity_id,
         coalesce(j.jury_points, 0), coalesce(t.televote_points, 0),
         coalesce(j.jury_points, 0) + coalesce(t.televote_points, 0),
         null, now()
  from public.participants p
  left join jury j on j.identity_id = coalesce(p.country_id, p.contest_entity_id)
  left join tele t on t.identity_id = coalesce(p.country_id, p.contest_entity_id)
  where p.show_id = _show_id
    and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  get diagnostics _inserted = row_count;
  perform public.sync_show_results_from_votes(_show_id);
  return _inserted;
end;
$$;

create or replace function private.studio2_result_preconditions(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_show public.shows%rowtype;
  v_config jsonb;
  v_jury_enabled boolean;
  v_televote_enabled boolean;
  v_jury_points_required integer;
  v_participant_count integer := 0;
  v_voter_count integer := 0;
  v_jury_vote_rows integer := 0;
  v_dnv_count integer := 0;
  v_jury_incomplete integer := 0;
  v_jury_conflicts integer := 0;
  v_jury_pending_review integer := 0;
  v_jury_invalidated integer := 0;
  v_televote_vote_rows integer := 0;
  v_result_rows integer := 0;
  v_reconcile_issues integer := 0;
  v_jury_ready boolean;
  v_televote_ready boolean;
  v_calculation_ready boolean;
  v_result_ready boolean;
  v_published_results boolean;
begin
  select * into v_show from public.shows where id = p_show_id;
  if not found then
    raise exception 'Show not found: %', p_show_id using errcode = 'P0002';
  end if;

  v_config := coalesce(v_show.voting_config, '{}'::jsonb);
  v_jury_enabled := coalesce((v_config ->> 'juryEnabled')::boolean, true);
  v_televote_enabled := coalesce((v_config ->> 'televoteEnabled')::boolean, true);
  v_jury_points_required := case
    when not v_jury_enabled then 0
    when jsonb_typeof(v_config -> 'juryPoints') = 'array'
      and jsonb_array_length(v_config -> 'juryPoints') > 0
      then jsonb_array_length(v_config -> 'juryPoints')
    else 10
  end;

  select count(*) into v_participant_count
  from public.participants p
  where p.show_id = p_show_id
    and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  select count(*) into v_voter_count
  from (
    select v.id as voter_id, v.country_id, v.contest_entity_id
    from public.voters v
    where v.show_id = p_show_id

    union all

    select null::uuid as voter_id, p.country_id, p.contest_entity_id
    from public.participants p
    where p.show_id = p_show_id
      and coalesce(p.participation_status, 'confirmed') = 'confirmed'
      and not exists (
        select 1 from public.voters roster where roster.show_id = p_show_id
      )
  ) expected;

  select count(*) into v_jury_vote_rows
  from public.jury_votes j
  where j.show_id = p_show_id
    and (
      j.ballot_submission_id is null
      or exists (
        select 1
        from public.jury_ballot_submissions submission
        where submission.id = j.ballot_submission_id
          and submission.status = 'valid'
      )
    );

  select count(*) into v_jury_pending_review
  from public.jury_ballot_submissions submission
  where submission.show_id = p_show_id
    and submission.status in ('submitted', 'needs_review');

  select count(*) into v_jury_invalidated
  from public.jury_ballot_submissions submission
  where submission.show_id = p_show_id
    and submission.status = 'invalidated';

  select count(*) into v_dnv_count
  from public.jury_ballot_statuses bs
  where bs.show_id = p_show_id
    and bs.status = 'did_not_vote';

  if v_jury_enabled then
    with expected as (
      select v.id as voter_id, v.country_id, v.contest_entity_id
      from public.voters v
      where v.show_id = p_show_id

      union all

      select null::uuid as voter_id, p.country_id, p.contest_entity_id
      from public.participants p
      where p.show_id = p_show_id
        and coalesce(p.participation_status, 'confirmed') = 'confirmed'
        and not exists (
          select 1 from public.voters roster where roster.show_id = p_show_id
        )
    )
    select
      count(*) filter (
        where exists (
          select 1
          from public.jury_ballot_statuses dnv
          where dnv.show_id = p_show_id
            and dnv.status = 'did_not_vote'
            and (
              (expected.voter_id is not null and dnv.voter_id = expected.voter_id)
              or (
                expected.voter_id is null
                and expected.contest_entity_id is not null
                and dnv.voter_entity_id = expected.contest_entity_id
              )
              or (
                expected.voter_id is null
                and expected.contest_entity_id is null
                and expected.country_id is not null
                and dnv.voter_country_id = expected.country_id
              )
            )
        )
        and exists (
          select 1
          from public.jury_votes vote
          where vote.show_id = p_show_id
            and (
              (expected.voter_id is not null and vote.voter_id = expected.voter_id)
              or (
                expected.voter_id is null
                and expected.contest_entity_id is not null
                and vote.voter_entity_id = expected.contest_entity_id
              )
              or (
                expected.voter_id is null
                and expected.contest_entity_id is null
                and expected.country_id is not null
                and vote.voter_country_id = expected.country_id
              )
            )
        )
      ),
      count(*) filter (
        where not exists (
          select 1
          from public.jury_ballot_statuses dnv
          where dnv.show_id = p_show_id
            and dnv.status = 'did_not_vote'
            and (
              (expected.voter_id is not null and dnv.voter_id = expected.voter_id)
              or (
                expected.voter_id is null
                and expected.contest_entity_id is not null
                and dnv.voter_entity_id = expected.contest_entity_id
              )
              or (
                expected.voter_id is null
                and expected.contest_entity_id is null
                and expected.country_id is not null
                and dnv.voter_country_id = expected.country_id
              )
            )
        )
        and not (
          exists (
            select 1
            from public.jury_ballot_submissions submission
            where submission.show_id = p_show_id
              and submission.status = 'valid'
              and (
                (expected.voter_id is not null and submission.voter_id = expected.voter_id)
                or (
                  expected.voter_id is null
                  and expected.contest_entity_id is not null
                  and submission.voter_entity_id = expected.contest_entity_id
                )
                or (
                  expected.voter_id is null
                  and expected.contest_entity_id is null
                  and expected.country_id is not null
                  and submission.voter_country_id = expected.country_id
                )
              )
              and (
                select count(*)
                from public.jury_votes linked_vote
                where linked_vote.ballot_submission_id = submission.id
              ) >= v_jury_points_required
          )
          or (
            not exists (
              select 1
              from public.jury_ballot_submissions any_submission
              where any_submission.show_id = p_show_id
                and (
                  (expected.voter_id is not null and any_submission.voter_id = expected.voter_id)
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is not null
                    and any_submission.voter_entity_id = expected.contest_entity_id
                  )
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is null
                    and expected.country_id is not null
                    and any_submission.voter_country_id = expected.country_id
                  )
                )
            )
            and (
              select count(*)
              from public.jury_votes manual_vote
              where manual_vote.show_id = p_show_id
                and manual_vote.ballot_submission_id is null
                and (
                  (expected.voter_id is not null and manual_vote.voter_id = expected.voter_id)
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is not null
                    and manual_vote.voter_entity_id = expected.contest_entity_id
                  )
                  or (
                    expected.voter_id is null
                    and expected.contest_entity_id is null
                    and expected.country_id is not null
                    and manual_vote.voter_country_id = expected.country_id
                  )
                )
            ) >= v_jury_points_required
          )
        )
      )
    into v_jury_conflicts, v_jury_incomplete
    from expected;
  end if;

  select count(*) into v_televote_vote_rows
  from public.televote_votes t
  where t.show_id = p_show_id;

  select count(*) into v_result_rows
  from public.results r
  where r.show_id = p_show_id;

  select count(*) into v_reconcile_issues
  from public.results r
  where r.show_id = p_show_id
    and r.total_points is distinct from (
      case when coalesce((v_config ->> 'weightedScoring')::boolean, false)
        then round(
          r.jury_points * (coalesce((v_config -> 'weighting' ->> 'jury')::numeric, 50) / 50.0)
          + r.televote_points * (coalesce((v_config -> 'weighting' ->> 'televote')::numeric, 50) / 50.0)
        )::integer
        else (r.jury_points + r.televote_points)::integer
      end
    );

  v_jury_ready := not v_jury_enabled
    or (v_voter_count > 0 and v_jury_conflicts = 0 and v_jury_incomplete = 0);
  v_televote_ready := not v_televote_enabled or v_televote_vote_rows > 0;
  v_calculation_ready := v_participant_count > 0 and v_jury_ready and v_televote_ready;
  v_result_ready := v_result_rows > 0
    and v_result_rows = v_participant_count
    and v_reconcile_issues = 0;
  v_published_results := coalesce(v_show.published, false)
    and coalesce((v_show.publication_config ->> 'results')::boolean, false);

  return jsonb_build_object(
    'participantCount', v_participant_count,
    'juryEnabled', v_jury_enabled,
    'juryRequiredPoints', v_jury_points_required,
    'juryVoterCount', v_voter_count,
    'juryVoteRows', v_jury_vote_rows,
    'juryDnvCount', v_dnv_count,
    'juryIncompleteCount', v_jury_incomplete,
    'juryConflictCount', v_jury_conflicts,
    'juryPendingReviewCount', v_jury_pending_review,
    'juryInvalidatedCount', v_jury_invalidated,
    'juryReady', v_jury_ready,
    'televoteEnabled', v_televote_enabled,
    'televoteVoteRows', v_televote_vote_rows,
    'televoteReady', v_televote_ready,
    'calculationReady', v_calculation_ready,
    'resultRowCount', v_result_rows,
    'reconcileIssueCount', v_reconcile_issues,
    'resultReady', v_result_ready,
    'publishedResults', v_published_results
  );
end
$$;

revoke all on function private.studio2_result_preconditions(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_result_preconditions(uuid)
  to service_role;

create or replace function private.studio2_sync_results_after_jury_ballot_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $sync$
begin
  perform public.sync_show_results_from_votes(
    case when tg_op = 'DELETE' then old.show_id else new.show_id end
  );
  return null;
end
$sync$;

revoke all on function private.studio2_sync_results_after_jury_ballot_review()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_ballot_review_results_sync
  on public.jury_ballot_submissions;
create trigger studio2_jury_ballot_review_results_sync
after update of status on public.jury_ballot_submissions
for each row
when (old.status is distinct from new.status)
execute function private.studio2_sync_results_after_jury_ballot_review();


notify pgrst, 'reload schema';

commit;
