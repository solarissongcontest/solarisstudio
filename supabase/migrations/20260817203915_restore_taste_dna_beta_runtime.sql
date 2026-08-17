-- Restore private Taste DNA ballot validation and RLS lost when production migration history was rebuilt.
-- Logic is carried forward from 20260812006000_phase_4_result_lab_taste_dna.sql.

create index if not exists fan_taste_ballots_profile_updated_idx
on public.fan_taste_ballots (profile_id, updated_at desc);

create index if not exists fan_taste_ballots_show_idx
on public.fan_taste_ballots (show_id);

create or replace function public.validate_fan_taste_ballot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ranking_count integer;
  distinct_count integer;
  invalid_count integer;
begin
  if auth.uid() is not null and new.profile_id <> auth.uid() then
    raise exception 'Taste ballot owner does not match the signed-in user';
  end if;

  if not public.show_publication_enabled(new.show_id, 'participants') then
    raise exception 'This show is not available for Taste DNA yet';
  end if;

  if jsonb_typeof(new.ranking) <> 'array' then
    raise exception 'Taste ranking must be a JSON array';
  end if;

  select count(*)::integer, count(distinct ranked.entry_id)::integer
  into ranking_count, distinct_count
  from jsonb_array_elements_text(new.ranking) ranked(entry_id);

  if ranking_count < 3 then raise exception 'Rank at least three entries before saving Taste DNA'; end if;
  if distinct_count <> ranking_count then raise exception 'Taste ranking contains duplicate entries'; end if;

  select count(*)::integer into invalid_count
  from jsonb_array_elements_text(new.ranking) ranked(entry_id)
  where not exists (
    select 1 from public.participants participant
    where participant.show_id = new.show_id
      and (
        participant.country_id::text = ranked.entry_id
        or participant.contest_entity_id::text = ranked.entry_id
      )
  );

  if invalid_count > 0 then raise exception 'Taste ranking contains an entry that does not belong to this show'; end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_fan_taste_ballot on public.fan_taste_ballots;
create trigger trg_validate_fan_taste_ballot
before insert or update on public.fan_taste_ballots
for each row execute function public.validate_fan_taste_ballot();

alter table public.fan_taste_ballots enable row level security;

drop policy if exists "Fans can read own taste ballots" on public.fan_taste_ballots;
create policy "Fans can read own taste ballots"
on public.fan_taste_ballots for select to authenticated
using (profile_id = auth.uid());

drop policy if exists "Fans can insert own taste ballots" on public.fan_taste_ballots;
create policy "Fans can insert own taste ballots"
on public.fan_taste_ballots for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists "Fans can update own taste ballots" on public.fan_taste_ballots;
create policy "Fans can update own taste ballots"
on public.fan_taste_ballots for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "Fans can delete own taste ballots" on public.fan_taste_ballots;
create policy "Fans can delete own taste ballots"
on public.fan_taste_ballots for delete to authenticated
using (profile_id = auth.uid());

revoke all on public.fan_taste_ballots from public, anon;
grant select, insert, update, delete on public.fan_taste_ballots to authenticated;
grant all on public.fan_taste_ballots to service_role;
