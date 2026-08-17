begin;

drop index if exists public.integration_events_dedupe_idx;
create unique index integration_events_dedupe_idx
  on public.integration_events(service, event_type, payload_hash);

commit;
