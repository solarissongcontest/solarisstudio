-- Canonical historical date for an SSC edition.
-- Use the Grand Final date, or the main event date when an edition has no final.
alter table public.editions
  add column if not exists event_date date;

comment on column public.editions.event_date is
  'Canonical SSC edition date used for historical chronology and anniversary-year calculations. Normally the Grand Final date; use the main event date if there is no Grand Final.';
