\set ON_ERROR_STOP on
-- Same disposable database and fixture as the maintenance edit rehearsal.
-- Roll back every positive/negative probe; never emit the synthetic secret.
begin;
set local statement_timeout='15s';
set local lock_timeout='2s';
do $test$
declare
  edition uuid := '00000000-0000-4000-8000-00000000e771';
  response uuid := '00000000-0000-4000-8000-00000000f771';
  actor uuid := '00000000-0000-4000-8000-00000000a773';
  issue_op uuid := '10000000-0000-4000-8000-00000000b781';
  version bigint;
  issued jsonb;
  replay jsonb;
  secret text;
  denied boolean;
  receipt_count bigint;
begin
  if not exists(select 1 from public.submissions where id=response and edition_id=edition) then
    raise exception 'Run the isolated maintenance edit fixture first';
  end if;
  select count(*) into receipt_count from public.studio2_operation_receipts;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('studio2.confirmation_maintenance_write','on',true);
  set local role authenticated;
  version := (public.studio2_confirmation_response_access_preview(edition,response)->>'expectedVersion')::bigint;
  perform public.studio2_apply_confirmation_response_access_change(edition,response,'update_access',
    '{"editingAllowed":true,"locked":false}',null,
    '10000000-0000-4000-8000-00000000b780','runtime-access-open',version);
  version := (public.studio2_confirmation_response_access_preview(edition,response)->>'expectedVersion')::bigint;
  issued := public.studio2_apply_confirmation_response_access_change(edition,response,'issue_recovery',
    '{"tokenType":"one_time","expiresInHours":1}',null,issue_op,'runtime-secret-issue',version);
  secret := issued->>'token';
  if secret is null or length(secret) is distinct from 64
     or (issued->>'secretAvailable')::boolean is distinct from true
     or issued->>'receiptId' is distinct from issue_op::text then
    raise exception 'Authorized issuance did not return its first-response secret';
  end if;
  replay := public.studio2_apply_confirmation_response_access_change(edition,response,'issue_recovery',
    '{"tokenType":"one_time","expiresInHours":1}',null,issue_op,'runtime-secret-issue',version);
  if (replay->>'replayed')::boolean is distinct from true
     or (replay->>'secretAvailable')::boolean is distinct from false or replay ? 'token'
     or replay->>'receiptId' is distinct from issue_op::text then
    raise exception 'Lost-response replay did not preserve its secret-free receipt';
  end if;
  denied := false;
  begin
    perform public.studio2_apply_confirmation_response_access_change(edition,response,'issue_recovery',
      '{"tokenType":"reusable"}',null,issue_op,'runtime-secret-issue',version);
  exception when sqlstate 'P0001' then
    if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise;end if;
    denied:=true;
  end;
  if not denied then raise exception 'Changed-payload replay accepted';end if;
  denied := false;
  begin
    perform public.studio2_apply_confirmation_response_access_change(edition,response,'update_access',
      '{"editingAllowed":false,"locked":false}',null,
      '10000000-0000-4000-8000-00000000b782','runtime-stale-access',version);
  exception when sqlstate 'PT409' then denied:=true;
  end;
  if not denied then raise exception 'Stale reviewed version accepted';end if;
  reset role;
  if exists(select 1 from public.studio2_operation_receipts where result::text like '%'||secret||'%')
     or exists(select 1 from public.admin_audit_log where after_data::text like '%'||secret||'%') then
    raise exception 'Plaintext recovery secret persisted in receipt/audit';
  end if;
  if (select count(*) from public.edit_tokens where submission_id=response and active)<>1 then
    raise exception 'Retry duplicated active recovery access';
  end if;
  -- A service role with no authenticated actor cannot self-authorize the command.
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  set local role service_role;
  denied:=false;
  begin
    perform public.studio2_apply_confirmation_response_access_change(edition,response,'invalidate_recovery',
      jsonb_build_object('tokenId',issued->>'tokenId'),null,
      '10000000-0000-4000-8000-00000000b783','runtime-service-no-actor',version);
  exception when insufficient_privilege then denied:=true;
  end;
  reset role;
  if not denied then raise exception 'Ungoverned service role command accepted';end if;
  -- Read-only inspector cannot issue credentials or preview their management state.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-00000000a774","role":"authenticated"}',true);
  set local role authenticated;
  denied:=false;
  begin
    perform public.studio2_confirmation_response_access_preview(edition,response);
  exception when insufficient_privilege then denied:=true;
  end;
  reset role;
  if not denied then raise exception 'Read-only inspector obtained management preview';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  set local role authenticated;
  denied:=false;
  begin
    perform public.studio2_confirmation_response_access_preview(
      '10000000-0000-4000-8000-00000000e771',response);
  exception when insufficient_privilege then denied:=true;
  end;
  reset role;
  if not denied then raise exception 'Cross-edition management preview accepted';end if;
  update public.studio2_capability_grants set expires_at=now()-interval '1 minute'
    where user_id=actor and capability='confirmation.manage' and edition_id=edition;
  set local role authenticated;
  denied:=false;
  begin
    perform public.studio2_apply_confirmation_response_access_change(edition,response,'issue_recovery',
      '{"tokenType":"one_time","expiresInHours":1}',null,issue_op,'runtime-secret-issue',version);
  exception when insufficient_privilege then denied:=true;
  end;
  reset role;
  if not denied then raise exception 'Expired capability replay accepted';end if;
  delete from public.studio2_capability_grants
    where user_id=actor and capability='confirmation.manage' and edition_id=edition;
  set local role authenticated;
  denied:=false;
  begin
    perform public.studio2_confirmation_response_access_preview(edition,response);
  exception when insufficient_privilege then denied:=true;
  end;
  reset role;
  if not denied then raise exception 'Revoked capability management preview accepted';end if;
  if (select count(*) from public.studio2_operation_receipts)<>receipt_count+2 then
    raise exception 'Denied/replayed request left an extra operation receipt';
  end if;
end $test$;
rollback;
