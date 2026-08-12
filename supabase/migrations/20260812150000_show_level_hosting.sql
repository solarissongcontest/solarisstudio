begin;

-- Each show can have its own host location. This supports split-host editions
-- such as semi-finals in one country/city and the Grand Final in another.
alter table public.shows
  add column if not exists host_country_id uuid references public.countries(id) on delete set null,
  add column if not exists host_city text;

create index if not exists shows_host_country_idx
  on public.shows(host_country_id);

-- Preserve existing editions automatically: every current show inherits the
-- edition-level host until an organizer gives that show a different host.
update public.shows s
set
  host_country_id = coalesce(s.host_country_id, e.host_country_id),
  host_city = coalesce(s.host_city, e.host_city)
from public.editions e
where e.id = s.edition_id
  and (s.host_country_id is null or s.host_city is null);

comment on column public.shows.host_country_id is
  'Country hosting this individual show. May differ between shows in the same edition.';

comment on column public.shows.host_city is
  'City hosting this individual show. May differ between shows in the same edition.';

commit;
