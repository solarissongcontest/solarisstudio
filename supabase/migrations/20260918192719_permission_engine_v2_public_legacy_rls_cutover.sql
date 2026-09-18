begin;

-- Permission Engine v2 cutover batch 22.
--
-- Remove the remaining legacy Organizer predicates from public-schema RLS.
-- Keep each surface on the narrow capability that matches its operation, and
-- resolve edition scope through canonical rows where the protected table does
-- not carry edition_id itself.

create or replace function private.studio2_submission_access_allowed(
  p_capability text,
  p_submission_id uuid,
  p_strict_before_cutover boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'private', 'pg_temp'
as $function$
  select coalesce((
    select public.studio2_access_allowed(
      p_capability,
      s.edition_id,
      p_strict_before_cutover
    )
    from public.submissions s
    where s.id = p_submission_id
  ), false);
$function$;

revoke all on function private.studio2_submission_access_allowed(text, uuid, boolean)
from public, anon, service_role;
grant execute on function private.studio2_submission_access_allowed(text, uuid, boolean)
to authenticated;

-- Beta / rollout feedback remains an elevated rollout-management surface.
drop policy if exists "Organizers can read admin beta feedback" on public.admin_beta_test_submissions;
create policy "Organizers can read admin beta feedback"
on public.admin_beta_test_submissions
for select
to authenticated
using (public.studio2_access_allowed('rollout.manage', null, false));

drop policy if exists "Organizers can submit admin beta feedback" on public.admin_beta_test_submissions;
create policy "Organizers can submit admin beta feedback"
on public.admin_beta_test_submissions
for insert
to authenticated
with check (
  public.studio2_access_allowed('rollout.manage', null, false)
  and length(btrim(tester_name)) >= 1
  and length(btrim(tester_name)) <= 120
  and device = any (array['Phone'::text, 'Tablet'::text, 'Laptop'::text, 'Desktop'::text])
  and jsonb_typeof(answers) = 'object'::text
  and jsonb_typeof(bug_reports) = 'array'::text
);

drop policy if exists "Organizers can read Beta 2 feedback" on public.beta2_test_submissions;
create policy "Organizers can read Beta 2 feedback"
on public.beta2_test_submissions
for select
to authenticated
using (public.studio2_access_allowed('rollout.manage', null, false));

drop policy if exists "Organizers can read beta feedback" on public.beta_test_submissions;
create policy "Organizers can read beta feedback"
on public.beta_test_submissions
for select
to authenticated
using (public.studio2_access_allowed('rollout.manage', null, false));

-- Some legacy Organizer workspace tables exist in the long-lived production
-- database but are not part of the canonical clean-install schema. Migrate
-- their policies when present and skip them safely on clean replay.
do $optional_legacy_admin$
begin
  if to_regclass('public.admin_deadlines') is not null then
    execute $policy$
      drop policy if exists "Organizers manage deadlines" on public.admin_deadlines
    $policy$;
    execute $policy$
      create policy "Organizers manage deadlines"
      on public.admin_deadlines
      for all
      to authenticated
      using (
        case
          when edition_id is not null then public.studio2_access_allowed('edition.manage', edition_id, false)
          when show_id is not null then private.studio2_show_access_allowed('edition.manage', show_id, false)
          else public.studio2_access_allowed('edition.manage', null, false)
        end
      )
      with check (
        case
          when edition_id is not null then public.studio2_access_allowed('edition.manage', edition_id, false)
          when show_id is not null then private.studio2_show_access_allowed('edition.manage', show_id, false)
          else public.studio2_access_allowed('edition.manage', null, false)
        end
      )
    $policy$;
  end if;

  if to_regclass('public.admin_notifications') is not null then
    execute $policy$
      drop policy if exists "Organizers read own notifications" on public.admin_notifications
    $policy$;
    execute $policy$
      create policy "Organizers read own notifications"
      on public.admin_notifications
      for select
      to authenticated
      using (
        recipient_id = auth.uid()
        and public.studio2_access_allowed('edition.manage', null, false)
      )
    $policy$;

    execute $policy$
      drop policy if exists "Organizers update own notifications" on public.admin_notifications
    $policy$;
    execute $policy$
      create policy "Organizers update own notifications"
      on public.admin_notifications
      for update
      to authenticated
      using (
        recipient_id = auth.uid()
        and public.studio2_access_allowed('edition.manage', null, false)
      )
      with check (
        recipient_id = auth.uid()
        and public.studio2_access_allowed('edition.manage', null, false)
      )
    $policy$;
  end if;

  if to_regclass('public.admin_preferences') is not null then
    execute $policy$
      drop policy if exists "Organizers manage own admin preferences" on public.admin_preferences
    $policy$;
    execute $policy$
      create policy "Organizers manage own admin preferences"
      on public.admin_preferences
      for all
      to authenticated
      using (
        user_id = auth.uid()
        and public.studio2_access_allowed('edition.manage', null, false)
      )
      with check (
        user_id = auth.uid()
        and public.studio2_access_allowed('edition.manage', null, false)
      )
    $policy$;
  end if;
end
$optional_legacy_admin$;

-- Content events are publishing operations, not generic edition reads.
drop policy if exists "organizers manage content events" on public.content_events;
create policy "organizers manage content events"
on public.content_events
for all
to authenticated
using (public.studio2_access_allowed('publishing.manage', null, false))
with check (public.studio2_access_allowed('publishing.manage', null, false));

-- Submission-linked internal administration resolves canonical edition scope
-- through submissions and requires elevated entry approval authority.
drop policy if exists "edit_tokens_organizer_all" on public.edit_tokens;
create policy "edit_tokens_organizer_all"
on public.edit_tokens
for all
to authenticated
using (
  private.studio2_submission_access_allowed('entry.approve', submission_id, false)
)
with check (
  private.studio2_submission_access_allowed('entry.approve', submission_id, false)
);

drop policy if exists "internal_entries_organizer_all" on public.internal_entries;
create policy "internal_entries_organizer_all"
on public.internal_entries
for all
to authenticated
using (
  private.studio2_submission_access_allowed('entry.approve', submission_id, false)
)
with check (
  private.studio2_submission_access_allowed('entry.approve', submission_id, false)
);

-- Integration plumbing remains elevated edition administration. Links carrying
-- an edition become scope-aware; unscoped events/links require global access.
drop policy if exists "integration events organizer only" on public.integration_events;
create policy "integration events organizer only"
on public.integration_events
for all
to authenticated
using (public.studio2_access_allowed('edition.manage', null, false))
with check (public.studio2_access_allowed('edition.manage', null, false));

drop policy if exists "integration links organizer only" on public.integration_links;
create policy "integration links organizer only"
on public.integration_links
for all
to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, false))
with check (public.studio2_access_allowed('edition.manage', edition_id, false));

-- Canonical televoting bindings carry a real public edition_id and can safely
-- use edition-scoped voting.manage.
drop policy if exists "televoting round bindings organizer only" on public.televoting_round_bindings;
create policy "televoting round bindings organizer only"
on public.televoting_round_bindings
for all
to authenticated
using (public.studio2_access_allowed('voting.manage', edition_id, false))
with check (public.studio2_access_allowed('voting.manage', edition_id, false));

-- Theme records can be shared by multiple editions, so raw theme mutation and
-- the elevated private-read bypass remain global edition administration.
drop policy if exists "themes organizer write" on public.themes;
create policy "themes organizer write"
on public.themes
for all
to authenticated
using (public.studio2_access_allowed('edition.manage', null, false))
with check (public.studio2_access_allowed('edition.manage', null, false));

drop policy if exists "themes public read" on public.themes;
create policy "themes public read"
on public.themes
for select
to public
using (
  is_public
  or exists (
    select 1 from public.shows s
    where s.theme_id = themes.id and s.published = true
  )
  or exists (
    select 1 from public.editions e
    where e.theme_id = themes.id and e.published = true
  )
  or (
    auth.uid() is not null
    and public.studio2_access_allowed('edition.manage', null, false)
  )
);

-- Regression guard: this batch must clear every remaining public-schema legacy
-- policy predicate except none; Prediction was handled in Batch 20.
do $verify$
declare
  v_remaining bigint;
begin
  select count(*) into v_remaining
  from pg_policies
  where schemaname = 'public'
    and (
      coalesce(qual, '') ilike '%has_role%'
      or coalesce(with_check, '') ilike '%has_role%'
    );

  if v_remaining <> 0 then
    raise exception 'public legacy role policy debt remains after Batch 22: %', v_remaining;
  end if;

  if not has_function_privilege(
    'authenticated',
    'private.studio2_submission_access_allowed(text,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute private.studio2_submission_access_allowed through RLS';
  end if;

  if has_function_privilege(
    'anon',
    'private.studio2_submission_access_allowed(text,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly gained private.studio2_submission_access_allowed EXECUTE';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
