begin;

-- Production smoke after 20261017201000 proved that the PostgREST pre-request
-- exception now reaches studio2_apply_confirmation_round_change, but the
-- canonical operation contract still rejects the claim through
-- private.studio2_platform_mutation_allowed(...). Keep the wider platform in
-- read_only while allowing only the existing-round Confirmation maintenance
-- commands, and only when the exact RPC pre-request allowlist has set the
-- transaction-local maintenance marker.
create or replace function private.studio2_platform_mutation_allowed(
  p_command text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(
    (
      select case state.mode
        when 'normal' then true
        when 'degraded' then true
        when 'read_only' then
          coalesce(p_command, '') in (
            'system.platform_mode.change',
            'system.push.retry_failed',
            'account.session.revoke'
          )
          or (
            coalesce(current_setting('studio2.confirmation_maintenance_write', true), '') = 'on'
            and coalesce(p_command, '') in (
              'confirmation.round.status',
              'confirmation.round.editing',
              'confirmation.round.update'
            )
          )
        when 'maintenance' then coalesce(p_command, '') in (
          'system.platform_mode.change',
          'account.session.revoke'
        )
        else false
      end
      from public.studio2_platform_operational_state state
      where state.singleton = true
    ),
    false
  );
$$;

-- Deliberately do not add confirmation.round.create/delete here. During the
-- browser maintenance window organizers may operate existing rounds, but the
-- read_only exception must not become a general round-authoring bypass.

notify pgrst, 'reload schema';

commit;
