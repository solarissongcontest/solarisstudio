begin;

create table if not exists public.public_ia_rollout_state (
  key text primary key,
  stage text not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_ia_rollout_state_key_check
    check (key = 'public_ia_v3'),
  constraint public_ia_rollout_state_stage_check
    check (stage in ('disabled','organizers','beta','signed_in','everyone'))
);

insert into public.public_ia_rollout_state (key, stage)
values ('public_ia_v3', 'beta')
on conflict (key) do nothing;

alter table public.public_ia_rollout_state enable row level security;

revoke all on table public.public_ia_rollout_state from public, anon, authenticated;
grant select on table public.public_ia_rollout_state to anon, authenticated;
grant update (stage) on table public.public_ia_rollout_state to authenticated;
grant all on table public.public_ia_rollout_state to service_role;

create or replace function public.admin_public_ia_rollout_readiness()
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_is_service boolean :=
    current_user = 'postgres'
    or coalesce(auth.role(), '') = 'service_role';
begin
  if not v_is_service
     and not public.studio2_access_allowed('rollout.manage', null, false) then
    raise exception 'Feature rollout management capability required'
      using errcode = '42501';
  end if;

  with task_keys(key) as (
    values
      ('beta3OldWinnerOutcome'),
      ('beta3CountryEntryOutcome'),
      ('beta3JuryScoresOutcome'),
      ('beta3CompareOutcome'),
      ('beta3ResultScenarioOutcome'),
      ('beta3ConfirmationOutcome'),
      ('beta3JuryVotingOutcome'),
      ('beta3EntryRuleOutcome'),
      ('beta3ConcernOutcome'),
      ('beta3AppealOutcome'),
      ('beta3TasteOutcome'),
      ('beta3CountryToolsOutcome')
  ),
  submission_scores as (
    select
      s.id,
      s.device,
      count(*) filter (
        where s.answers ->> k.key in (
          'Found immediately',
          'Found after looking around',
          'Found, but it was difficult'
        )
      )::int as successes
    from public.beta3_test_submissions s
    cross join task_keys k
    group by s.id, s.device
  ),
  submission_metrics as (
    select
      count(*)::int as responses,
      coalesce(sum(successes), 0)::int as successful_tasks,
      (count(*) * 12)::int as task_attempts,
      count(*) filter (where device in ('Phone','Tablet'))::int as mobile_responses,
      count(*) filter (where device in ('Laptop','Desktop'))::int as desktop_responses,
      coalesce(sum(successes) filter (where device in ('Phone','Tablet')), 0)::int as mobile_successes,
      coalesce(sum(successes) filter (where device in ('Laptop','Desktop')), 0)::int as desktop_successes
    from submission_scores
  ),
  outcome_metrics as (
    select
      count(*) filter (
        where answers ->> 'beta3OldWinnerOutcome' in (
          'Found immediately',
          'Found after looking around',
          'Found, but it was difficult'
        )
      )::int as old_edition_successes,
      count(*) filter (
        where coalesce(answers ->> 'beta3CountryEntryOutcome', '') not in (
          'Found immediately',
          'Found after looking around',
          'Found, but it was difficult'
        )
      )::int as country_entry_failures
    from public.beta3_test_submissions
  ),
  task_runs as (
    select distinct on (metadata ->> 'task_run')
      metadata ->> 'task_run' as run_id,
      metadata ->> 'beta_task' as task
    from public.public_ux_events
    where event_name = 'task_started'
      and metadata ? 'task_run'
      and metadata ? 'beta_task'
    order by metadata ->> 'task_run', created_at, id
  ),
  first_clicks as (
    select distinct on (metadata ->> 'task_run')
      metadata ->> 'task_run' as run_id,
      metadata ->> 'beta_task' as task,
      target
    from public.public_ux_events
    where event_name in (
      'public_nav_clicked',
      'section_nav_clicked',
      'search_result_clicked',
      'breadcrumb_clicked',
      'hub_primary_clicked'
    )
      and metadata ? 'task_run'
      and metadata ? 'beta_task'
      and target is not null
    order by metadata ->> 'task_run', created_at, id
  ),
  expected(task, prefix) as (
    values
      ('beta3-old-edition-winner','/explore'),
      ('beta3-old-edition-winner','/editions'),
      ('beta3-old-edition-winner','/results'),
      ('beta3-country-entry','/explore'),
      ('beta3-country-entry','/countries'),
      ('beta3-country-entry','/editions'),
      ('beta3-jury-scores','/results'),
      ('beta3-jury-scores','/scorecharts'),
      ('beta3-jury-scores','/editions'),
      ('beta3-jury-scores','/shows'),
      ('beta3-compare-countries','/results'),
      ('beta3-compare-countries','/compare'),
      ('beta3-compare-countries','/tools'),
      ('beta3-result-scenario','/results'),
      ('beta3-result-scenario','/result-lab'),
      ('beta3-result-scenario','/tools'),
      ('beta3-confirmation','/participate'),
      ('beta3-confirmation','/confirmations'),
      ('beta3-confirmation','/my-solaris'),
      ('beta3-jury-voting','/participate'),
      ('beta3-jury-voting','/jury-voting'),
      ('beta3-jury-voting','/my-solaris'),
      ('beta3-entry-rule','/guide'),
      ('beta3-entry-rule','/rules'),
      ('beta3-entry-rule','/integrity/preclearance'),
      ('beta3-entry-rule','/site-directory'),
      ('beta3-report-concern','/guide'),
      ('beta3-report-concern','/integrity'),
      ('beta3-report-concern','/site-directory'),
      ('beta3-appeal','/guide'),
      ('beta3-appeal','/integrity'),
      ('beta3-appeal','/integrity/appeals'),
      ('beta3-appeal','/site-directory'),
      ('beta3-voting-taste','/results'),
      ('beta3-voting-taste','/taste-dna'),
      ('beta3-voting-taste','/tools'),
      ('beta3-country-tools','/my-solaris'),
      ('beta3-country-tools','/country-hub'),
      ('beta3-country-tools','/auth')
  ),
  first_click_metrics as (
    select
      count(*)::int as started,
      count(*) filter (
        where exists (
          select 1
          from first_clicks fc
          join expected e on e.task = tr.task
          where fc.run_id = tr.run_id
            and (fc.target = e.prefix or fc.target like e.prefix || '/%')
        )
      )::int as successful
    from task_runs tr
  ),
  metrics as (
    select
      sm.responses,
      sm.successful_tasks,
      sm.task_attempts,
      sm.mobile_responses,
      sm.desktop_responses,
      sm.mobile_successes,
      sm.desktop_successes,
      om.old_edition_successes,
      om.country_entry_failures,
      fcm.started as first_click_started,
      fcm.successful as first_click_successful,
      case when sm.task_attempts > 0
        then round(sm.successful_tasks::numeric / sm.task_attempts * 100, 1)
        else null end as core_task_success_percent,
      case when sm.responses > 0
        then round(om.old_edition_successes::numeric / sm.responses * 100, 1)
        else null end as old_edition_lookup_percent,
      case when fcm.started > 0
        then round(fcm.successful::numeric / fcm.started * 100, 1)
        else null end as first_click_success_percent,
      case when sm.mobile_responses > 0
        then round(sm.mobile_successes::numeric / (sm.mobile_responses * 12) * 100, 1)
        else null end as mobile_success_percent,
      case when sm.desktop_responses > 0
        then round(sm.desktop_successes::numeric / (sm.desktop_responses * 12) * 100, 1)
        else null end as desktop_success_percent
    from submission_metrics sm
    cross join outcome_metrics om
    cross join first_click_metrics fcm
  )
  select jsonb_build_object(
    'responses', responses,
    'minimumResponses', 10,
    'coreTaskSuccessPercent', core_task_success_percent,
    'firstClickSuccessPercent', first_click_success_percent,
    'oldEditionLookupPercent', old_edition_lookup_percent,
    'countryEntryFailures', country_entry_failures,
    'mobileResponses', mobile_responses,
    'desktopResponses', desktop_responses,
    'mobileSuccessPercent', mobile_success_percent,
    'desktopSuccessPercent', desktop_success_percent,
    'mobileDesktopGapPercent',
      case
        when mobile_success_percent is not null and desktop_success_percent is not null
        then round(abs(mobile_success_percent - desktop_success_percent), 1)
        else null
      end,
    'ready',
      responses >= 10
      and coalesce(core_task_success_percent >= 90, false)
      and coalesce(first_click_success_percent >= 80, false)
      and coalesce(old_edition_lookup_percent >= 90, false)
      and country_entry_failures <= 1
      and mobile_responses > 0
      and desktop_responses > 0
      and coalesce(abs(mobile_success_percent - desktop_success_percent) <= 5, false)
  )
  into v_result
  from metrics;

  return v_result;
end
$$;

revoke all on function public.admin_public_ia_rollout_readiness()
  from public, anon, authenticated;
grant execute on function public.admin_public_ia_rollout_readiness()
  to authenticated, service_role;

drop policy if exists "Public can read public IA rollout stage"
  on public.public_ia_rollout_state;
create policy "Public can read public IA rollout stage"
on public.public_ia_rollout_state
for select
to anon, authenticated
using (true);

drop policy if exists "Organizers can advance public IA rollout"
  on public.public_ia_rollout_state;
create policy "Organizers can advance public IA rollout"
on public.public_ia_rollout_state
for update
to authenticated
using (public.studio2_access_allowed('rollout.manage', null, false))
with check (
  public.studio2_access_allowed('rollout.manage', null, false)
  and (
    stage in ('disabled','organizers','beta')
    or coalesce((public.admin_public_ia_rollout_readiness() ->> 'ready')::boolean, false)
  )
);

create or replace function public.sync_public_ia_rollout_stage()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();

  perform public.studio2_set_feature_flag(
    'public_ia_v3',
    new.stage <> 'disabled',
    new.stage in ('organizers','beta'),
    '{}'::uuid[],
    '{}'::uuid[]
  );

  return new;
end
$$;

revoke all on function public.sync_public_ia_rollout_stage()
  from public, anon, authenticated;

drop trigger if exists public_ia_rollout_stage_sync
  on public.public_ia_rollout_state;
create trigger public_ia_rollout_stage_sync
before update of stage
on public.public_ia_rollout_state
for each row
when (old.stage is distinct from new.stage)
execute function public.sync_public_ia_rollout_stage();

notify pgrst, 'reload schema';

commit;
