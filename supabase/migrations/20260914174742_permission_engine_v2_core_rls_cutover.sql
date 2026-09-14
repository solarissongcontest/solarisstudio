begin;

-- Permission Engine v2 cutover batch 1.
--
-- This batch makes the resolver genuinely independent from legacy user_roles once
-- permission_engine_v2 is globally enabled, while preserving shadow/dual behavior
-- before cutover. It also migrates the core contest, voting and Studio 2 RLS
-- boundaries to capability-aware predicates so the eventual flag flip does not
-- require another policy rewrite.

create or replace function private.studio2_permission_engine_authoritative()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce((
    select
      f.enabled
      and not f.admins_only
      and cardinality(coalesce(f.user_ids, '{}'::uuid[])) = 0
      and cardinality(coalesce(f.edition_ids, '{}'::uuid[])) = 0
    from public.studio2_feature_flags f
    where f.key = 'permission_engine_v2'
  ), false)
$$;

-- Shadow mode previously projected legacy user_roles into the v2 capability
-- resolver dynamically. Persist live operators as explicit v2 assignments before
-- authoritative mode can ignore the legacy table. Historical role rows whose Auth
-- users have been deleted are intentionally ignored.
insert into public.studio2_role_assignments (
  user_id,
  role_key,
  edition_id,
  expires_at,
  assigned_by
)
select
  ur.user_id,
  ur.role::text,
  null,
  null,
  null
from public.user_roles ur
join auth.users au on au.id = ur.user_id
join public.studio2_access_roles ar on ar.key = ur.role::text
where ur.role::text in ('organizer', 'viewer')
on conflict (user_id, role_key, edition_id) do nothing;

create or replace function private.studio2_user_has_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select p_user_id is not null and (
    exists (
      select 1
      from public.studio2_capability_grants g
      where g.user_id = p_user_id
        and g.capability = p_capability
        and (g.expires_at is null or g.expires_at > now())
        and (g.edition_id is null or (p_edition_id is not null and g.edition_id = p_edition_id))
    )
    or exists (
      select 1
      from public.studio2_role_assignments a
      join public.studio2_role_capabilities rc on rc.role_key = a.role_key
      where a.user_id = p_user_id
        and rc.capability = p_capability
        and (a.expires_at is null or a.expires_at > now())
        and (a.edition_id is null or (p_edition_id is not null and a.edition_id = p_edition_id))
    )
    or (
      not private.studio2_permission_engine_authoritative()
      and exists (
        select 1
        from public.user_roles ur
        join public.studio2_role_capabilities rc on rc.role_key = ur.role::text
        where ur.user_id = p_user_id
          and rc.capability = p_capability
      )
    )
  )
$$;

-- One predicate for migrated RLS boundaries. Before cutover, reads can be reached
-- through legacy Organizer OR v2 capability. Sensitive writes use strict=true and
-- therefore require BOTH. Once the flag is globally authoritative, only the v2
-- capability decision is considered.
create or replace function public.studio2_access_allowed(
  p_capability text,
  p_edition_id uuid default null,
  p_strict_before_cutover boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_capability_allowed boolean;
  v_legacy_allowed boolean;
begin
  if private.studio2_request_is_service_role() then
    return true;
  end if;

  if v_actor is null then
    return false;
  end if;

  v_capability_allowed := private.studio2_user_has_capability(
    v_actor,
    p_capability,
    p_edition_id
  );

  if private.studio2_permission_engine_authoritative() then
    return v_capability_allowed;
  end if;

  v_legacy_allowed := public.has_role(v_actor, 'organizer'::public.app_role);

  if p_strict_before_cutover then
    return v_legacy_allowed and v_capability_allowed;
  end if;

  return v_legacy_allowed or v_capability_allowed;
end
$$;

revoke all on function private.studio2_permission_engine_authoritative()
  from public, anon, authenticated;
revoke all on function public.studio2_access_allowed(text, uuid, boolean)
  from public;
grant execute on function public.studio2_access_allowed(text, uuid, boolean)
  to anon, authenticated, service_role;

-- Strict-dual trigger helper becomes capability-authoritative automatically after
-- the rollout flag is globally enabled. Until then it keeps recording shadow
-- evidence and requires legacy Organizer + v2 capability.
create or replace function private.studio2_require_strict_dual(
  p_capability text,
  p_edition_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_request_role text := coalesce(auth.role(), '');
  v_decision jsonb;
  v_capability_allowed boolean;
begin
  if private.studio2_request_is_service_role() then
    return;
  end if;

  if v_actor is null then
    if v_request_role in ('anon', 'authenticated') then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    return;
  end if;

  if private.studio2_permission_engine_authoritative() then
    v_capability_allowed := private.studio2_user_has_capability(
      v_actor,
      p_capability,
      p_edition_id
    );
    if not v_capability_allowed then
      raise exception 'Capability required: %', p_capability using errcode = '42501';
    end if;
    return;
  end if;

  v_decision := public.studio2_check_capability_shadow(
    p_capability,
    p_edition_id,
    p_action,
    null
  );

  if not coalesce((v_decision ->> 'legacyAllowed')::boolean, false)
     or not coalesce((v_decision ->> 'capabilityAllowed')::boolean, false) then
    raise exception 'Strict dual authorization requires Organizer role and capability: %',
      p_capability
      using errcode = '42501';
  end if;
end
$$;

-- CORE EDITION + ENTRY TABLES -------------------------------------------------

drop policy if exists "editions organizer write" on public.editions;
create policy "editions capability write"
on public.editions
for all
to authenticated
using (public.studio2_access_allowed('edition.manage', id, true))
with check (public.studio2_access_allowed('edition.manage', id, true));

drop policy if exists "editions public read" on public.editions;
create policy "editions public or capability read"
on public.editions
for select
using (
  published
  or public.studio2_access_allowed('edition.read', id, false)
);

drop policy if exists "shows organizer write" on public.shows;
create policy "shows capability write"
on public.shows
for all
to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, true))
with check (public.studio2_access_allowed('edition.manage', edition_id, true));

drop policy if exists "shows public read published" on public.shows;
create policy "shows public or capability read"
on public.shows
for select
using (
  published
  or public.studio2_access_allowed('edition.read', edition_id, false)
);

drop policy if exists "contest entities organizer write" on public.contest_entities;
create policy "contest entities capability write"
on public.contest_entities
for all
to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, true))
with check (public.studio2_access_allowed('edition.manage', edition_id, true));

drop policy if exists "contest entities public read by participants" on public.contest_entities;
create policy "contest entities public or capability read"
on public.contest_entities
for select
using (
  exists (
    select 1
    from public.participants p
    where p.edition_id = contest_entities.edition_id
      and (
        p.contest_entity_id = contest_entities.id
        or (
          contest_entities.country_id is not null
          and p.country_id = contest_entities.country_id
        )
      )
      and (
        (p.show_id is not null and public.show_publication_enabled(p.show_id, 'participants'))
        or (
          p.show_id is null
          and exists (
            select 1 from public.editions e
            where e.id = p.edition_id and e.published = true
          )
        )
      )
  )
  or public.studio2_access_allowed('edition.read', edition_id, false)
);

drop policy if exists "entries organizer write" on public.entries;
create policy "entries capability write"
on public.entries
for all
to authenticated
using (public.studio2_access_allowed('entry.edit', edition_id, true))
with check (public.studio2_access_allowed('entry.edit', edition_id, true));

drop policy if exists "entries public read published" on public.entries;
create policy "entries public or capability read"
on public.entries
for select
using (
  exists (
    select 1
    from public.editions e
    where e.id = entries.edition_id
      and (
        e.published = true
        or public.studio2_access_allowed('entry.read_private', entries.edition_id, false)
      )
  )
);

drop policy if exists "participants organizer write" on public.participants;
create policy "participants capability write"
on public.participants
for all
to authenticated
using (public.studio2_access_allowed('entry.edit', edition_id, true))
with check (public.studio2_access_allowed('entry.edit', edition_id, true));

drop policy if exists "participants public read by publication" on public.participants;
create policy "participants public or capability read"
on public.participants
for select
using (
  (
    show_id is not null
    and public.show_publication_enabled(show_id, 'participants')
  )
  or (
    show_id is null
    and exists (
      select 1 from public.editions e
      where e.id = participants.edition_id and e.published = true
    )
  )
  or public.studio2_access_allowed('entry.read_private', edition_id, false)
);

drop policy if exists "participants unreleased entry protection" on public.participants;
create policy "participants unreleased owner or capability read"
on public.participants
for select
using (
  publication_status = 'published'
  or (
    publication_status = 'scheduled'
    and scheduled_publish_at is not null
    and scheduled_publish_at <= now()
  )
  or public.studio2_access_allowed('entry.read_private', edition_id, false)
  or exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = auth.uid()
      and ca.status = 'active'
      and ca.country_id = participants.country_id
  )
);

-- VOTING + RESULTS -----------------------------------------------------------

drop policy if exists "jury votes jury organizer write" on public.jury_votes;
drop policy if exists "jury organizer write" on public.jury_votes;
create policy "jury votes capability write"
on public.jury_votes
for all
to authenticated
using (public.studio2_access_allowed('jury.ballots.manage', edition_id, true))
with check (public.studio2_access_allowed('jury.ballots.manage', edition_id, true));

drop policy if exists "jury public read detailed only" on public.jury_votes;
create policy "jury public or capability read"
on public.jury_votes
for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'detailed_voting'))
  or (
    show_id is null
    and exists (
      select 1 from public.editions e
      where e.id = jury_votes.edition_id and e.published = true
    )
  )
  or public.studio2_access_allowed('jury.ballots.read', edition_id, false)
);

drop policy if exists "televote organizer write" on public.televote_votes;
create policy "televote capability write"
on public.televote_votes
for all
to authenticated
using (public.studio2_access_allowed('televote.ballots.manage', edition_id, true))
with check (public.studio2_access_allowed('televote.ballots.manage', edition_id, true));

drop policy if exists "televote public read detailed only" on public.televote_votes;
create policy "televote public or capability read"
on public.televote_votes
for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'detailed_voting'))
  or (
    show_id is null
    and exists (
      select 1 from public.editions e
      where e.id = televote_votes.edition_id and e.published = true
    )
  )
  or public.studio2_access_allowed('televote.ballots.read', edition_id, false)
);

drop policy if exists "voters organizer write" on public.voters;
create policy "voters capability write"
on public.voters
for all
to authenticated
using (public.studio2_access_allowed('voting.manage', edition_id, true))
with check (public.studio2_access_allowed('voting.manage', edition_id, true));

drop policy if exists "voters public read detailed only" on public.voters;
create policy "voters public or capability read"
on public.voters
for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'detailed_voting'))
  or (
    show_id is null
    and exists (
      select 1 from public.editions e
      where e.id = voters.edition_id and e.published = true
    )
  )
  or public.studio2_access_allowed('voting.read', edition_id, false)
);

drop policy if exists "results organizer write" on public.results;
create policy "results capability write"
on public.results
for all
to authenticated
using (public.studio2_access_allowed('results.verify', edition_id, true))
with check (public.studio2_access_allowed('results.verify', edition_id, true));

drop policy if exists "results public read by publication" on public.results;
create policy "results public or capability read"
on public.results
for select
using (
  (show_id is not null and public.show_publication_enabled(show_id, 'results'))
  or (
    show_id is null
    and exists (
      select 1 from public.editions e
      where e.id = results.edition_id and e.published = true
    )
  )
  or public.studio2_access_allowed('results.preview', edition_id, false)
);

drop policy if exists "Organizers can manage jury voting windows" on public.jury_voting_windows;
create policy "capability can manage jury voting windows"
on public.jury_voting_windows
for all
to authenticated
using (public.studio2_access_allowed('voting.manage', edition_id, true))
with check (public.studio2_access_allowed('voting.manage', edition_id, true));

drop policy if exists "Organizers can view jury voting windows" on public.jury_voting_windows;
create policy "capability can view jury voting windows"
on public.jury_voting_windows
for select
to authenticated
using (public.studio2_access_allowed('voting.read', edition_id, false));

drop policy if exists "jury ballot statuses organizer access" on public.jury_ballot_statuses;
create policy "jury ballot statuses capability access"
on public.jury_ballot_statuses
for all
to authenticated
using (public.studio2_access_allowed('jury.ballots.manage', edition_id, true))
with check (public.studio2_access_allowed('jury.ballots.manage', edition_id, true));

drop policy if exists "Organizers can view jury submissions" on public.jury_ballot_submissions;
create policy "capability can view jury submissions"
on public.jury_ballot_submissions
for select
to authenticated
using (public.studio2_access_allowed('jury.ballots.read', edition_id, false));

-- DELEGATION + STUDIO 2 READ BOUNDARIES ------------------------------------

drop policy if exists "organizers can manage hod assignments" on public.delegation_hod_assignments;
create policy "capability can manage hod assignments"
on public.delegation_hod_assignments
for all
to authenticated
using (public.studio2_access_allowed('delegation.manage', edition_id, true))
with check (public.studio2_access_allowed('delegation.manage', edition_id, true));

drop policy if exists "organizers can manage hod people" on public.delegation_people;
create policy "capability can manage hod people"
on public.delegation_people
for all
to authenticated
using (public.studio2_access_allowed('delegation.manage', null, true))
with check (public.studio2_access_allowed('delegation.manage', null, true));

drop policy if exists "studio2_contest_events_read" on public.studio2_contest_events;
create policy "studio2_contest_events_capability_read"
on public.studio2_contest_events
for select
to authenticated
using (public.studio2_access_allowed('edition.read', edition_id, false));

drop policy if exists "studio2_edition_runtime_read" on public.studio2_edition_runtime;
create policy "studio2_edition_runtime_capability_read"
on public.studio2_edition_runtime
for select
to authenticated
using (public.studio2_access_allowed('edition.read', edition_id, false));

drop policy if exists "studio2_delegation_settings_read" on public.studio2_delegation_settings;
create policy "studio2_delegation_settings_capability_read"
on public.studio2_delegation_settings
for select
to authenticated
using (
  public.owns_country(auth.uid(), country_id)
  or public.studio2_access_allowed('delegation.read', edition_id, false)
);

drop policy if exists "studio2_jury_members_read" on public.studio2_jury_members;
create policy "studio2_jury_members_capability_read"
on public.studio2_jury_members
for select
to authenticated
using (
  public.owns_country(auth.uid(), country_id)
  or public.studio2_access_allowed('jury.ballots.read', edition_id, false)
);

drop policy if exists "studio2_transition_approval_read" on public.studio2_transition_approval_requests;
create policy "studio2_transition_approval_capability_read"
on public.studio2_transition_approval_requests
for select
to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, false));

drop policy if exists "studio2_incidents_read" on public.studio2_incidents;
create policy "studio2_incidents_capability_read"
on public.studio2_incidents
for select
to authenticated
using (
  public.studio2_access_allowed('incident.read', edition_id, false)
  or public.studio2_access_allowed('integrity.read', edition_id, false)
);

drop policy if exists "studio2_feature_flags_organizer_read" on public.studio2_feature_flags;
create policy "studio2_feature_flags_capability_read"
on public.studio2_feature_flags
for select
to authenticated
using (public.studio2_access_allowed('rollout.read', null, false));

drop policy if exists "studio2_notice_receipts_read" on public.studio2_notice_receipts;
create policy "studio2_notice_receipts_capability_read"
on public.studio2_notice_receipts
for select
to authenticated
using (
  recipient_user_id = auth.uid()
  or exists (
    select 1
    from public.studio2_official_notices n
    where n.id = studio2_notice_receipts.notice_id
      and public.studio2_access_allowed('communications.read', n.edition_id, false)
  )
);

-- ACCESS ADMINISTRATION ------------------------------------------------------

drop policy if exists "organizers grant roles" on public.user_roles;
create policy "capability managers grant legacy roles"
on public.user_roles
for insert
to authenticated
with check (public.studio2_access_allowed('permissions.manage', null, true));

drop policy if exists "organizers read all roles" on public.user_roles;
create policy "capability managers read legacy roles"
on public.user_roles
for select
to authenticated
using (public.studio2_access_allowed('permissions.read', null, false));

drop policy if exists "Organizers read audit log" on public.admin_audit_log;
create policy "capability auditors read audit log"
on public.admin_audit_log
for select
to authenticated
using (public.studio2_access_allowed('permissions.audit', null, false));

revoke all on function private.studio2_require_strict_dual(text, uuid, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
