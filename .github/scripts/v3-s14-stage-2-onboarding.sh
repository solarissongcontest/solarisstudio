#!/usr/bin/env bash
set -euo pipefail

run_s14_stage_2_onboarding() {
  log "Stage 2/10: delegation onboarding, HOD access, requirements and notifications"

  create_user 's14-organizer-a@solaris.invalid' 'S14 Organizer A'; ORGANIZER_A_ID="$LAST_USER_ID"
  create_user 's14-organizer-b@solaris.invalid' 'S14 Organizer B'; ORGANIZER_B_ID="$LAST_USER_ID"

  db_exec "
insert into public.studio2_role_assignments(user_id, role_key, edition_id, expires_at, assigned_by)
values
  ('$ORGANIZER_A_ID'::uuid, 'organizer', null, null, null),
  ('$ORGANIZER_B_ID'::uuid, 'organizer', null, null, null)
on conflict on constraint studio2_role_assignments_scope_unique do nothing;
"

  for i in $(seq 1 66); do
    email="s14-hod-$(printf '%02d' "$i")@solaris.invalid"
    create_user "$email" "S14 HOD $(printf '%02d' "$i")"
    hod_id="$LAST_USER_ID"
    country_id="14000000-0000-4000-8000-$(printf '%012d' "$i")"
    db_exec "
insert into public.fan_profiles(id) values ('$hod_id'::uuid) on conflict (id) do nothing;
insert into public.country_accounts(user_id, country_id, status, instagram_username, display_name)
values ('$hod_id'::uuid, '$country_id'::uuid, 'active', 's14_hod_$(printf '%02d' "$i")', 'S14 HOD $(printf '%02d' "$i")')
on conflict (user_id) do update set country_id=excluded.country_id, status='active', display_name=excluded.display_name, updated_at=now();
insert into public.notification_preferences(profile_id, in_app_enabled, categories, external_enabled)
values ('$hod_id'::uuid, true, array['confirmations','deadlines','jury','televoting','results']::text[], true)
on conflict (profile_id) do update set in_app_enabled=true, categories=excluded.categories, external_enabled=true, updated_at=now();
"
  done

  for i in $(seq 1 4); do
    email="s14-fan-$(printf '%02d' "$i")@solaris.invalid"
    create_user "$email" "S14 Fan $(printf '%02d' "$i")"
    fan_id="$LAST_USER_ID"
    db_exec "insert into public.fan_profiles(id) values ('$fan_id'::uuid) on conflict (id) do nothing;"
  done

  db_exec "
insert into public.studio2_confirmation_requirements(edition_id,country_id,generation,status,reason,valid_from,created_by)
select '$EDITION_ID'::uuid, $country_uuid_sql, 1, 'required', 'S14 canonical edition onboarding requirement', now(), '$ORGANIZER_A_ID'::uuid
from generate_series(1,66) i
on conflict (edition_id,country_id,generation) do update set
  status='required', reason=excluded.reason, resolved_by_submission_id=null, resolved_at=null,
  invalidated_at=null, invalidated_by=null, invalidated_reason=null, superseded_at=null, updated_at=now();

select public.solaris_enqueue_app_notifications(now());
"

  [[ "$(db_scalar "select count(*) from public.country_accounts ca join public.countries c on c.id=ca.country_id where c.region='S14' and ca.status='active';")" == "66" ]] || fail "not all 66 delegations received active HOD access"
  [[ "$(db_scalar "select count(*) from public.studio2_confirmation_requirements where edition_id='$EDITION_ID'::uuid and superseded_at is null;")" == "66" ]] || fail "not all 66 delegations received a current confirmation requirement"
  [[ "$(db_scalar "select count(*) from public.notification_deliveries d join public.country_accounts ca on ca.user_id=d.user_id join public.countries c on c.id=ca.country_id where c.region='S14' and d.event_type like 'confirmation.%';")" -gt 0 ]] || fail "onboarding did not produce confirmation notification candidates"
  [[ "$(db_scalar "select count(*) from public.studio2_role_assignments where user_id in ('$ORGANIZER_A_ID'::uuid,'$ORGANIZER_B_ID'::uuid) and role_key='organizer';")" == "2" ]] || fail "S14 organizer access seed incomplete"
  [[ "$(db_scalar "select count(*) from public.fan_profiles fp join public.country_accounts ca on ca.user_id=fp.id join public.countries c on c.id=ca.country_id where c.region='S14';")" == "66" ]] || fail "all HOD identities must also have fan-profile notification ownership"

  log "S14_STAGE_2_DELEGATION_ONBOARDING_COMPLETE"
}
