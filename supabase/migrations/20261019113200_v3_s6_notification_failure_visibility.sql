begin;

-- System V3 / S6 follow-up: failed delivery is not successful convergence.
--
-- Reconciliation deliberately does not auto-retry failed push deliveries; that
-- remains an explicit governed operator action. The independent verifier must,
-- however, report an expected delivery that is still failed as drift rather
-- than declaring the projection consistent merely because the stable identity
-- exists.
select public.v3_register_migration_contract(
  '20261019113200_v3_s6_notification_failure_visibility',
  1,
  'forward_fix_only',
  false,
  null,
  'S6 notification verification exposes expected failed deliveries without auto-retry'
);

create or replace function public.studio2_verify_notification_delivery_projection(
  p_user_id uuid,
  p_now timestamptz default now(),
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $verify$
declare
  v_expected integer := 0;
  v_pending integer := 0;
  v_missing integer := 0;
  v_stale integer := 0;
  v_suppressed_expected integer := 0;
  v_failed_expected integer := 0;
  v_workload integer := 0;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Recipient is required' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'Verification limit must be between 1 and 500' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected
  from private.solaris_expected_notification_deliveries(p_user_id, p_now);

  select count(*)::integer
  into v_pending
  from public.notification_deliveries delivery
  where delivery.user_id = p_user_id
    and delivery.status = 'pending';

  v_workload := v_expected + v_pending;
  if v_workload > p_limit then
    return jsonb_build_object(
      'userId', p_user_id,
      'state', 'unknown',
      'reason', 'verification_bound_exceeded',
      'expectedCurrent', v_expected,
      'pendingCurrent', v_pending,
      'workload', v_workload,
      'limit', p_limit,
      'verifiedAt', now()
    );
  end if;

  select count(*)::integer
  into v_missing
  from private.solaris_expected_notification_deliveries(p_user_id, p_now) expected
  where not exists (
    select 1
    from public.notification_deliveries delivery
    where delivery.user_id = p_user_id
      and delivery.dedupe_key = expected.dedupe_key
  );

  select count(*)::integer
  into v_suppressed_expected
  from private.solaris_expected_notification_deliveries(p_user_id, p_now) expected
  join public.notification_deliveries delivery
    on delivery.user_id = expected.user_id
   and delivery.dedupe_key = expected.dedupe_key
  where delivery.status = 'suppressed';

  select count(*)::integer
  into v_failed_expected
  from private.solaris_expected_notification_deliveries(p_user_id, p_now) expected
  join public.notification_deliveries delivery
    on delivery.user_id = expected.user_id
   and delivery.dedupe_key = expected.dedupe_key
  where delivery.status = 'failed';

  select count(*)::integer
  into v_stale
  from private.solaris_stale_notification_delivery_ids(p_user_id);

  return jsonb_build_object(
    'userId', p_user_id,
    'state', case
      when v_missing = 0
       and v_stale = 0
       and v_suppressed_expected = 0
       and v_failed_expected = 0
      then 'consistent'
      else 'drift'
    end,
    'reason', 'verified',
    'expectedCurrent', v_expected,
    'pendingCurrent', v_pending,
    'missingCurrent', v_missing,
    'stalePending', v_stale,
    'suppressedExpected', v_suppressed_expected,
    'failedExpected', v_failed_expected,
    'workload', v_workload,
    'limit', p_limit,
    'verifiedAt', now()
  );
end
$verify$;

revoke all on function public.studio2_verify_notification_delivery_projection(uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_verify_notification_delivery_projection(uuid, timestamptz, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
