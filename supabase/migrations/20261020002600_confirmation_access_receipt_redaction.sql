begin;

select public.v3_register_migration_contract(
  '20261020002600_confirmation_access_receipt_redaction',
  1,
  'forward_fix_only',
  false,
  null,
  'Keep private Organizer Confirmation notes out of persistent operation receipt scope while retaining request fingerprints for idempotency conflict detection.'
);

create or replace function private.v3_redact_confirmation_access_receipt_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $redact$
begin
  if new.command = 'confirmation.response.access.update'
     and coalesce(new.scope, '{}'::jsonb) ? 'adminNotes' then
    new.scope :=
      (coalesce(new.scope, '{}'::jsonb) - 'adminNotes')
      || jsonb_build_object(
        'adminNotesPresent',
        nullif(btrim(coalesce(new.scope ->> 'adminNotes', '')), '') is not null
      );
  end if;
  return new;
end;
$redact$;

revoke all on function private.v3_redact_confirmation_access_receipt_scope()
  from public, anon, authenticated;

drop trigger if exists v3_redact_confirmation_access_receipt_scope
  on public.studio2_operation_receipts;
create trigger v3_redact_confirmation_access_receipt_scope
before insert or update of scope, command
on public.studio2_operation_receipts
for each row execute function private.v3_redact_confirmation_access_receipt_scope();

comment on function private.v3_redact_confirmation_access_receipt_scope() is
  'Redacts private Confirmation admin-note text from stored operation scope. request_fingerprint is computed from the semantic request before insert, so same-key/different-note replays still conflict without persisting note contents.';

commit;
