begin;

-- V3 Entry may display authoritative Confirmation receipt evidence, but it must
-- not gain a second submission authority. The caller supplies only a submission
-- UUID selected by the server Entry bundle; this function independently proves
-- that the authenticated country account owns that exact submission and derives
-- the canonical round from public_country_account_confirmation_access().
create or replace function public.v3_country_account_entry_receipt(
  p_submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $receipt$
declare
  v_access jsonb;
  v_response jsonb;
  v_operation private.v3_confirmation_operations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_submission_id is null then
    raise exception 'Entry submission context is incomplete' using errcode = '22023';
  end if;

  v_access := public.public_country_account_confirmation_access();
  if (v_access ->> 'authenticated') is distinct from 'true' then
    return jsonb_build_object('found', false);
  end if;

  select response.value
  into v_response
  from jsonb_array_elements(coalesce(v_access -> 'responses', '[]'::jsonb)) response(value)
  where response.value ->> 'submission_id' = p_submission_id::text
  limit 1;

  if v_response is null then
    return jsonb_build_object('found', false);
  end if;

  select operation.*
  into v_operation
  from private.v3_confirmation_operations operation
  where operation.result ->> 'submission_id' = p_submission_id::text
    and operation.round_id::text = v_response ->> 'round_id'
  order by operation.accepted_at desc
  limit 1;

  if not found then
    -- A canonical response can legitimately predate the V3 receipt ledger. Do
    -- not fabricate receipt evidence from submission timestamps or device time.
    return jsonb_build_object(
      'found', false,
      'submission_id', p_submission_id,
      'round_id', v_response ->> 'round_id'
    );
  end if;

  return jsonb_build_object(
    'found', true,
    'submission_id', p_submission_id,
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'receipt_id', v_operation.receipt_id,
      'round_id', v_operation.round_id,
      'accepted_at', v_operation.accepted_at
    )
  );
end
$receipt$;

revoke all on function public.v3_country_account_entry_receipt(uuid)
  from public, anon;
grant execute on function public.v3_country_account_entry_receipt(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
