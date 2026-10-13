begin;

-- Enable only Solaris App V3 surfaces that have completed their independent
-- production cutover and exact-SHA verification. Draft-only V3 surfaces remain
-- outside production routing until their own cutover gates are complete.
do $rollout$
declare
  v_expected_flags constant text[] := array[
    'solaris_app_v3',
    'solaris_app_v3_confirmation',
    'solaris_app_v3_scoreboard',
    'solaris_app_v3_account_settings'
  ];
  v_present integer;
begin
  select count(*)
  into v_present
  from public.studio2_feature_flags
  where key = any(v_expected_flags);

  if v_present <> cardinality(v_expected_flags) then
    raise exception
      'Refusing Solaris App V3 rollout: expected % certified feature flags, found %',
      cardinality(v_expected_flags),
      v_present;
  end if;

  update public.studio2_feature_flags
  set
    enabled = true,
    admins_only = false,
    user_ids = '{}'::uuid[],
    edition_ids = '{}'::uuid[],
    updated_at = now()
  where key = any(v_expected_flags);
end
$rollout$;

notify pgrst, 'reload schema';

commit;
