begin;

create table if not exists public.jury_ballot_statuses (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  voter_id uuid references public.voters(id) on delete cascade,
  voter_country_id uuid references public.countries(id) on delete cascade,
  voter_entity_id uuid references public.contest_entities(id) on delete cascade,
  status text not null check (status in ('did_not_vote')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jury_ballot_status_identity_chk check (
    voter_id is not null or voter_country_id is not null or voter_entity_id is not null
  )
);

create unique index if not exists jury_ballot_status_identity_key
  on public.jury_ballot_statuses (
    show_id,
    coalesce(voter_id, voter_entity_id, voter_country_id)
  );

create index if not exists jury_ballot_status_edition_idx
  on public.jury_ballot_statuses (edition_id);
create index if not exists jury_ballot_status_show_idx
  on public.jury_ballot_statuses (show_id);

alter table public.jury_ballot_statuses enable row level security;

grant select, insert, update, delete on public.jury_ballot_statuses to authenticated;
grant all on public.jury_ballot_statuses to service_role;

drop policy if exists "jury ballot statuses organizer access" on public.jury_ballot_statuses;
create policy "jury ballot statuses organizer access"
on public.jury_ballot_statuses
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create trigger jury_ballot_statuses_updated_at
before update on public.jury_ballot_statuses
for each row execute function public.update_updated_at_column();

commit;
