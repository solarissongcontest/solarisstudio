begin;

-- PR #450 final review-blocker hardening.
--
-- This migration intentionally repairs the final definitions produced by the
-- earlier V5/V6 migrations instead of rewriting migration history. Fresh local
-- CI replays and already-applied validation databases therefore converge on the
-- same authoritative contracts.

-- ---------------------------------------------------------------------------
-- 1. Confirmation edits that move a submission between countries/editions must
--    obey the same one-active-requirement rule as a new submission.
-- ---------------------------------------------------------------------------
create or replace function private.studio2_guard_duplicate_confirmation_submission()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_country_id uuid;
  v_requirement_status text;
  v_requirement_generation integer;
begin
  if tg_op = 'UPDATE'
     and old.country is not distinct from new.country
     and old.edition_id is not distinct from new.edition_id then
    return new;
  end if;

  v_country_id := private.studio2_confirmation_country_id(new.country);

  if v_country_id is null then
    return new;
  end if;

  -- Serialize destination-country claims so two browser requests cannot both
  -- observe the requirement as available and then satisfy it concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'studio2-confirmation-requirement:' || new.edition_id::text || ':' || v_country_id::text,
      0
    )
  );

  select requirement.status, requirement.generation
  into v_requirement_status, v_requirement_generation
  from public.studio2_confirmation_requirements requirement
  where requirement.edition_id = new.edition_id
    and requirement.country_id = v_country_id
    and requirement.superseded_at is null
  limit 1
  for update;

  if v_requirement_status in ('satisfied', 'waived') then
    raise exception
      'This delegation already completed confirmation requirement generation %. A new submission requires explicit reconfirmation.',
      v_requirement_generation
      using errcode = '23505';
  end if;

  return new;
end
$guard$;

revoke all on function private.studio2_guard_duplicate_confirmation_submission()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_duplicate_submission_guard
  on public.submissions;
create trigger studio2_confirmation_duplicate_submission_guard
before insert or update of country, edition_id on public.submissions
for each row
execute function private.studio2_guard_duplicate_confirmation_submission();

-- ---------------------------------------------------------------------------
-- 2/6. Final Organizer Task reconciliation must retain system-job truth and
--      treat submitted/reviewed jury ballot lifecycle states as present.
-- ---------------------------------------------------------------------------
create or replace function private.studio2_repair_jury_missing_ballot_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $repair$
begin
  with missing_by_show as (
    select
      jury_window.show_id,
      jury_window.edition_id,
      count(*) filter (
        where not exists (
          select 1
          from public.jury_ballot_submissions ballot
          where ballot.show_id = jury_window.show_id
            and ballot.voter_country_id = voter.country_id
            and ballot.status in ('submitted', 'needs_review', 'valid')
        )
        and not exists (
          select 1
          from public.jury_ballot_statuses ballot_status
          where ballot_status.show_id = jury_window.show_id
            and ballot_status.status = 'did_not_vote'
            and (
              ballot_status.voter_id = voter.id
              or ballot_status.voter_country_id = voter.country_id
              or (
                voter.contest_entity_id is not null
                and ballot_status.voter_entity_id = voter.contest_entity_id
              )
            )
        )
      )::integer as missing_count
    from public.jury_voting_windows jury_window
    join public.voters voter
      on voter.show_id = jury_window.show_id
     and voter.country_id is not null
    where jury_window.status = 'open'
      and (p_edition_id is null or jury_window.edition_id = p_edition_id)
    group by jury_window.show_id, jury_window.edition_id
  )
  update public.studio2_organizer_tasks task
  set
    state = case when missing.missing_count > 0 then 'open' else 'resolved' end,
    title = case
      when missing.missing_count > 0 then
        'Jury voting is missing ' || missing.missing_count::text || ' ballot' ||
        case when missing.missing_count = 1 then '' else 's' end
      else task.title
    end,
    resolved_at = case
      when missing.missing_count > 0 then null
      else coalesce(task.resolved_at, now())
    end,
    last_evaluated_at = now(),
    updated_at = now()
  from missing_by_show missing
  where task.source_kind = 'jury_missing_ballots'
    and task.source_id = missing.show_id::text;
end
$repair$;

revoke all on function private.studio2_repair_jury_missing_ballot_tasks(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3/4. A ballot lifecycle mutation creates a new unreviewed result version.
--      Result mutation and publication use the same per-show advisory lock, and
--      the publication boundary re-checks release readiness while holding it.
-- ---------------------------------------------------------------------------
create or replace function private.studio2_sync_results_after_jury_ballot_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $sync$
declare
  v_show_id uuid := case when tg_op = 'DELETE' then old.show_id else new.show_id end;
  v_edition_id uuid;
begin
  if v_show_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || v_show_id::text, 0)
  );

  -- Published result layers are terminal until explicitly made private. Do not
  -- let a ballot review silently rewrite what the public can already see.
  if exists (
    select 1
    from public.shows show
    where show.id = v_show_id
      and coalesce(show.published, false)
      and private.studio2_publication_has_outcomes(show.publication_config)
  ) then
    raise exception
      'Make the published result layer private before changing a jury ballot lifecycle.'
      using errcode = '55000';
  end if;

  select show.edition_id
  into v_edition_id
  from public.shows show
  where show.id = v_show_id;

  perform public.sync_show_results_from_votes(v_show_id);

  if v_edition_id is not null then
    insert into public.studio2_result_operations (
      show_id,
      edition_id,
      calculation_version,
      last_calculated_at,
      last_calculated_by,
      reviewed_version,
      reviewed_at,
      reviewed_by,
      locked_version,
      locked_at,
      locked_by,
      reveal_ready_version,
      reveal_ready_at,
      reveal_ready_by,
      updated_at
    )
    values (
      v_show_id,
      v_edition_id,
      1,
      now(),
      auth.uid(),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      now()
    )
    on conflict (show_id) do update set
      calculation_version = public.studio2_result_operations.calculation_version + 1,
      last_calculated_at = now(),
      last_calculated_by = auth.uid(),
      reviewed_version = null,
      reviewed_at = null,
      reviewed_by = null,
      locked_version = null,
      locked_at = null,
      locked_by = null,
      reveal_ready_version = null,
      reveal_ready_at = null,
      reveal_ready_by = null,
      updated_at = now();
  end if;

  return null;
end
$sync$;

revoke all on function private.studio2_sync_results_after_jury_ballot_review()
  from public, anon, authenticated;

create or replace function private.studio2_serialize_show_publication_with_results()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $serialize$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || new.id::text, 0)
  );

  if coalesce(new.published, false)
     and private.studio2_publication_has_outcomes(new.publication_config)
     and not private.studio2_result_release_ready(new.id) then
    raise exception
      'The current result version is not reviewed, locked and reveal ready.'
      using errcode = '55000';
  end if;

  return new;
end
$serialize$;

revoke all on function private.studio2_serialize_show_publication_with_results()
  from public, anon, authenticated;

drop trigger if exists studio2_serialize_show_publication_with_results
  on public.shows;
create trigger studio2_serialize_show_publication_with_results
before update of published, publication_config on public.shows
for each row
execute function private.studio2_serialize_show_publication_with_results();

-- ---------------------------------------------------------------------------
-- 5. Confirmations is no longer a remote edition store. Project every canonical
--    edition through the compatibility RPC and forbid the legacy RPC from
--    creating a second public.editions row.
-- ---------------------------------------------------------------------------
create or replace function public.admin_confirmation_editions()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $editions$
  select case
    when private.solaris_confirmation_admin_allowed() then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'edition_number', e.edition_number,
          'description', e.description,
          'status', case when e.status = 'completed' then 'finished' else e.status end,
          'editing_enabled', coalesce(e.editing_enabled, false),
          'created_at', e.created_at,
          'response_count', (
            select count(*)::integer
            from public.submissions s
            where s.edition_id = e.id
          ),
          'rounds', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'edition_id', r.edition_id,
                'name', r.name,
                'status', r.status,
                'editing_enabled', coalesce(r.editing_enabled, false),
                'opens_at', r.opens_at,
                'closes_at', r.closes_at,
                'response_limit', r.response_limit,
                'response_count', (
                  select count(*)::integer
                  from public.submissions sr
                  where sr.round_id = r.id
                ),
                'created_at', r.created_at
              )
              order by r.created_at, r.name
            )
            from public.submission_rounds r
            where r.edition_id = e.id
          ), '[]'::jsonb)
        )
        order by e.edition_number desc nulls last, e.created_at desc
      )
      from public.editions e
    ), '[]'::jsonb)
    else (select null::jsonb from (select 1) denied where false)
  end;
$editions$;

create or replace function public.admin_confirmation_save_edition(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_id uuid := nullif(_payload ->> 'id', '')::uuid;
  v_number integer := nullif(_payload ->> 'edition_number', '')::integer;
  v_name text := nullif(btrim(_payload ->> 'name'), '');
  v_description text := nullif(btrim(_payload ->> 'description'), '');
  v_legacy_status text := coalesce(nullif(_payload ->> 'status', ''), 'draft');
  v_status text;
  v_editing boolean := coalesce((_payload ->> 'editing_enabled')::boolean, false);
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception
      'Confirmations cannot create canonical editions. Create the edition in Organizer edition management first.'
      using errcode = '55000';
  end if;
  if v_name is null or v_number is null then
    raise exception 'Edition name and number are required' using errcode = '22023';
  end if;
  if v_legacy_status not in ('draft', 'active', 'finished', 'completed') then
    raise exception 'Invalid edition status' using errcode = '22023';
  end if;

  v_status := case
    when v_legacy_status in ('finished', 'completed') then 'completed'
    else v_legacy_status
  end;

  update public.editions
  set
    name = v_name,
    edition_number = v_number,
    description = v_description,
    status = v_status,
    editing_enabled = v_editing,
    published = case when v_status = 'draft' then published else true end
  where id = v_id;

  if not found then
    raise exception 'Canonical edition not found' using errcode = 'P0002';
  end if;

  return v_id;
end
$save$;

revoke all on function public.admin_confirmation_editions()
  from public, anon;
grant execute on function public.admin_confirmation_editions()
  to authenticated, service_role;
revoke all on function public.admin_confirmation_save_edition(jsonb)
  from public, anon;
grant execute on function public.admin_confirmation_save_edition(jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7/8. Upload preparation must match the finalizer exactly. Admin beta uploads
--      require a real Organizer capability; caller-controlled JSON is never an
--      authorization decision. Public images remain <= 5 MB and fonts WOFF2.
-- ---------------------------------------------------------------------------
create or replace function public.studio2_prepare_upload(
  p_domain text,
  p_entity_id uuid,
  p_scope text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $prepare$
declare
  v_actor uuid := auth.uid();
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_scope text := lower(btrim(coalesce(p_scope, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_context jsonb := case when jsonb_typeof(p_context) = 'object' then p_context else '{}'::jsonb end;
  v_token_id uuid := gen_random_uuid();
  v_secret text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_extension text;
  v_final_bucket text;
  v_final_path text;
  v_quarantine_path text;
  v_admin_beta boolean := coalesce((v_context ->> 'admin')::boolean, false);
begin
  if not private.studio2_upload_platform_allows_prepare() then
    raise exception 'Uploads are unavailable while Solaris is Read-only or in Maintenance'
      using errcode = '25006';
  end if;

  if v_name = '' or length(v_name) > 220 then
    raise exception 'A valid upload file name is required' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 then
    raise exception 'Upload must contain at least one byte' using errcode = '22023';
  end if;

  v_extension := private.studio2_upload_extension(v_domain, v_name, v_mime);
  if v_extension is null then
    raise exception 'Unsupported file type for upload domain %', v_domain using errcode = '22023';
  end if;

  if v_domain = 'country_media' then
    if v_actor is null
       or p_entity_id is null
       or not private.studio2_can_upload_country_media(v_actor, p_entity_id) then
      raise exception 'Country media upload access required' using errcode = '42501';
    end if;
    if v_scope not in ('flags', 'gallery', 'backgrounds') then
      raise exception 'Unknown country media folder' using errcode = '22023';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
       or p_size > 5242880 then
      raise exception 'Country media must be JPG, PNG or WebP and no larger than 5 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'country-media';
    v_final_path := p_entity_id::text || '/' || v_scope || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'edition_artwork' then
    if v_actor is null
       or p_entity_id is null
       or not public.studio2_access_allowed('edition.manage', p_entity_id, false) then
      raise exception 'Edition design access required' using errcode = '42501';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
       or p_size > 5242880 then
      raise exception 'Edition artwork must be JPG, PNG or WebP and no larger than 5 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'edition-artwork';
    v_final_path := p_entity_id::text || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'country_font' then
    if v_actor is null
       or p_entity_id is null
       or not private.studio2_can_upload_country_media(v_actor, p_entity_id) then
      raise exception 'Country font upload access required' using errcode = '42501';
    end if;
    if v_mime <> 'font/woff2'
       or v_extension <> 'woff2'
       or p_size > 4194304 then
      raise exception 'Custom font delivery accepts validated WOFF2 files only, no larger than 4 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'country-fonts';
    v_final_path := v_actor::text || '/' || p_entity_id::text || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'beta_feedback' then
    if v_admin_beta and (
      v_actor is null
      or not public.studio2_access_allowed('edition.manage', null, false)
    ) then
      raise exception 'Organizer capability required for admin beta feedback'
        using errcode = '42501';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
       or p_size > 5242880 then
      raise exception 'Beta screenshots must be JPG, PNG or WebP and no larger than 5 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'beta-feedback';
    v_final_path :=
      case when v_admin_beta then 'admin/' else 'public/' end
      || v_token_id::text || '.' || v_extension;

  else
    raise exception 'Unknown upload domain' using errcode = '22023';
  end if;

  v_quarantine_path := v_token_id::text || '/' || v_token_id::text || '.' || v_extension;

  insert into public.studio2_upload_authorizations (
    id,
    actor_id,
    domain,
    entity_id,
    scope,
    final_bucket,
    quarantine_path,
    final_path,
    original_name,
    declared_mime,
    expected_size,
    authorization_secret,
    context
  )
  values (
    v_token_id,
    v_actor,
    v_domain,
    p_entity_id,
    nullif(v_scope, ''),
    v_final_bucket,
    v_quarantine_path,
    v_final_path,
    v_name,
    v_mime,
    p_size,
    v_secret,
    v_context
  );

  return jsonb_build_object(
    'token_id', v_token_id,
    'upload_secret', v_secret,
    'bucket', 'solaris-upload-quarantine',
    'object_path', v_quarantine_path,
    'final_bucket', v_final_bucket,
    'expires_at', now() + interval '10 minutes'
  );
end
$prepare$;

revoke all on function public.studio2_prepare_upload(
  text, uuid, text, text, text, bigint, jsonb
) from public;
grant execute on function public.studio2_prepare_upload(
  text, uuid, text, text, text, bigint, jsonb
) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Reopened domain tasks receive a new push activation while preserving
--    indefinite delivery history and the unique (user_id, dedupe_key) contract.
-- ---------------------------------------------------------------------------
alter table public.admin_notifications
  add column if not exists activation_version bigint not null default 1
    check (activation_version > 0);

create or replace function private.studio2_bump_notification_activation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $activation$
begin
  if old.resolution_mode = 'domain'
     and old.resolved_at is not null
     and new.resolved_at is null then
    new.activation_version := old.activation_version + 1;
  end if;
  return new;
end
$activation$;

revoke all on function private.studio2_bump_notification_activation()
  from public, anon, authenticated;

drop trigger if exists studio2_bump_notification_activation
  on public.admin_notifications;
create trigger studio2_bump_notification_activation
before update of resolved_at on public.admin_notifications
for each row
execute function private.studio2_bump_notification_activation();

create or replace function private.studio2_version_organizer_delivery_dedupe()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $delivery$
declare
  v_activation bigint;
begin
  if new.category <> 'organizer_tasks' then
    return new;
  end if;

  select notification.activation_version
  into v_activation
  from public.studio2_organizer_tasks task
  join public.admin_notifications notification
    on notification.source_key = task.source_key
   and notification.recipient_id = new.user_id
  where task.id::text = new.subject_id
  limit 1;

  new.dedupe_key := regexp_replace(new.dedupe_key, ':activation-[0-9]+$', '')
    || ':activation-' || coalesce(v_activation, 1)::text;

  return new;
end
$delivery$;

revoke all on function private.studio2_version_organizer_delivery_dedupe()
  from public, anon, authenticated;

drop trigger if exists studio2_version_organizer_delivery_dedupe
  on public.notification_deliveries;
create trigger studio2_version_organizer_delivery_dedupe
before insert on public.notification_deliveries
for each row
execute function private.studio2_version_organizer_delivery_dedupe();

-- ---------------------------------------------------------------------------
-- 10. Production maintenance inspection is safe only when the authoritative
--     database is already Read-only/Maintenance. The Worker consumes this tiny
--     anonymous boolean probe and fails closed if it cannot prove that state.
-- ---------------------------------------------------------------------------
create or replace function public.solaris_maintenance_read_only_probe()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $probe$
  select coalesce((
    select state.mode in ('read_only', 'maintenance')
    from public.studio2_platform_operational_state state
    where state.singleton = true
  ), false);
$probe$;

revoke all on function public.solaris_maintenance_read_only_probe()
  from public;
grant execute on function public.solaris_maintenance_read_only_probe()
  to anon, authenticated, service_role;

select private.studio2_reconcile_all_organizer_tasks(null);

notify pgrst, 'reload schema';

commit;
