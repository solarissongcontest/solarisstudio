begin;

-- Follow-up invariant for the new Public UX error event. PostgreSQL CHECK
-- constraints accept NULL expressions, so key presence alone is insufficient:
-- the event must contain a concrete non-empty class as well.
select public.v3_register_migration_contract(
  '20261020001600_v3_public_ux_error_shape_hardening',
  1,
  'forward_fix_only',
  false,
  null,
  'Require every public_error_shown telemetry event to carry a concrete low-cardinality error class'
);

alter table public.public_ux_events
  drop constraint if exists public_ux_events_error_event_value_check;

alter table public.public_ux_events
  add constraint public_ux_events_error_event_value_check check (
    event_name <> 'public_error_shown'
    or nullif(metadata ->> 'error_class', '') is not null
  );

commit;
