begin;

-- These functions are organizer tools reached from the authenticated Solaris
-- admin UI. Their bodies already verify organizer status; anonymous callers
-- should not be allowed to invoke them at all.
revoke all on function public.admin_country_accounts() from public, anon;
grant execute on function public.admin_country_accounts() to authenticated, service_role;

revoke all on function public.admin_set_country_account_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_country_account_status(uuid, text, text) to authenticated, service_role;

revoke all on function public.admin_edition_health_summary(uuid) from public, anon;
grant execute on function public.admin_edition_health_summary(uuid) to authenticated, service_role;

revoke all on function public.assign_jury_vote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.assign_jury_vote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer) to authenticated, service_role;

revoke all on function public.clear_jury_point(uuid, uuid, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.clear_jury_point(uuid, uuid, uuid, uuid, uuid, integer) to authenticated, service_role;

-- Friend-voting settings are updated only by a server action that first checks
-- the signed-in Solaris organizer and then calls this RPC with the service role.
-- Do not expose the raw mutation RPC to browsers, where p_actor_id could be
-- supplied by the caller.
revoke all on function public.update_friend_voting_settings_with_audit(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_friend_voting_settings_with_audit(uuid, jsonb) to service_role;

-- Trigger functions never need to be called through PostgREST. Revoking direct
-- browser execution does not affect their trigger execution.
revoke all on function public.preserve_edition_participation_before_show_delete() from public, anon, authenticated;
grant execute on function public.preserve_edition_participation_before_show_delete() to service_role;

revoke all on function public.sync_participant_entry_details() from public, anon, authenticated;
grant execute on function public.sync_participant_entry_details() to service_role;

-- Immutable helper: pin search_path so resolution cannot be influenced by a
-- caller-controlled session path.
alter function public.participant_same_edition_identity(uuid, uuid, uuid, uuid, uuid, uuid)
  set search_path = public, pg_temp;

notify pgrst, 'reload schema';

commit;
