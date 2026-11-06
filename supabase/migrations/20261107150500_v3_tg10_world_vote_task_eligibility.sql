-- TG10 prerequisite: reuse WORLD-05's frozen-electorate AND live-actor vote authority
-- when the existing V5 Task Engine eventually schedules institutional_vote.
-- This is deliberately NOT a new Task writer, notifier or public RPC.
-- Must be applied AFTER TG8 20261107130000/130100/130200; do not apply to production
-- until the canonical World rollout and local-only migration rehearsal are approved.
begin;

create or replace function private.world_vote_task_recipient_eligible_v1(
  p_vote_id uuid,
  p_country_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $eligible$
declare
  -- Do not accept a caller-chosen historical timestamp: proxy membership,
  -- voting deadlines and platform authorization must be true NOW.
  v_at timestamptz := pg_catalog.clock_timestamp();
begin
  if p_vote_id is null or p_country_id is null or p_user_id is null then
    return false;
  end if;

  -- The same two feature contracts used by the authoritative TG8 cast command.
  -- Null, failed or disabled rollout never implies recipient entitlement.
  if not (
    coalesce(public.studio2_feature_enabled('terra_world_voting_rules', null), false)
    and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting', null), false)
  ) then
    return false;
  end if;

  -- A platform transition to Read-only/Maintenance revokes actionable tasks
  -- synchronously, even if a previously queued delivery has not been pruned.
  if not exists (
    select 1
    from public.studio2_capabilities capability
    join public.studio2_platform_operational_state platform
      on platform.singleton = true
    where capability.key = 'world.vote.cast'
      and private.studio2_capability_allowed_in_platform_mode(
        capability.key, capability.access_level, platform.mode
      )
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.world_votes vote
    join public.world_vote_eligibility seat
      on seat.vote_id = vote.id
    join public.world_organizations organization
      on organization.id = vote.organization_id
    join public.world_organization_organs organ
      on organ.id = vote.organ_id
     and organ.organization_id = organization.id
    where vote.id = p_vote_id
      and seat.country_id = p_country_id
      and seat.eligible is true
      and vote.status = 'open'
      and vote.opened_at <= v_at
      and v_at < vote.closes_at
      and organization.status = 'active'
      and organ.status = 'active'
      -- Never replace this with an edition/global capability check.
      -- TG8 validates frozen revisions AND current membership, representative
      -- identity, proxy revocation and proxy validity at this instant.
      and private.world_vote_cast_authorized_v1(
        vote.id, seat.country_id, p_user_id, v_at
      )
      -- One country/seat has exactly one immutable ballot; after it is cast,
      -- every affected user's task entitlement disappears.
      and not exists (
        select 1 from private.world_ballots ballot
        where ballot.vote_id = vote.id
          and ballot.country_id = seat.country_id
      )
  );
end
$eligible$;

revoke all on function private.world_vote_task_recipient_eligible_v1(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

comment on function private.world_vote_task_recipient_eligible_v1(uuid,uuid,uuid) is
  'TG8-derived present-tense institutional_vote recipient eligibility; internal-only predicate for future canonical V5 Task Engine reconciliation and pre-send check. Does NOT create tasks or enqueue notifications.';

commit;
