#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-countback] %s\n' "$*"; }
fail() { printf '\n[v3-s5-countback] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgres://postgres:postgres@localhost:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing hosted/non-local database rehearsal ($DB_URL)" ;; esac

log "Proving canonical Results countback uses lower Jury award counts after equal top scores"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q <<'SQL'
begin;

insert into public.countries(id,name,short_code) values
  ('00000000-0000-4000-8000-00000000c991','Countback Alpha','CBA'),
  ('00000000-0000-4000-8000-00000000c992','Countback Beta','CBB'),
  ('00000000-0000-4000-8000-00000000c993','Countback Voter 1','CV1'),
  ('00000000-0000-4000-8000-00000000c994','Countback Voter 2','CV2'),
  ('00000000-0000-4000-8000-00000000c995','Countback Voter 3','CV3'),
  ('00000000-0000-4000-8000-00000000c996','Countback Voter 4','CV4'),
  ('00000000-0000-4000-8000-00000000c997','Countback Voter 5','CV5'),
  ('00000000-0000-4000-8000-00000000c998','Countback Voter 6','CV6');

insert into public.editions(id,name,slug,edition_number,status,published) values
  ('00000000-0000-4000-8000-00000000e991','S5 Countback Parity','s5-countback-parity',99991,'active',false);

insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config) values (
  '00000000-0000-4000-8000-00000000a991',
  '00000000-0000-4000-8000-00000000e991',
  'S5 Countback Final',
  'final',
  1,
  false,
  '{"juryPoints":[12,10,8,7,6,5,4,3,2,1],"tieBreak":["countback"],"juryEnabled":true,"televoteEnabled":false}'::jsonb
);

insert into public.participants(
  id,edition_id,show_id,country_id,artist,song,semi_final,running_order,participation_status
) values
  ('00000000-0000-4000-8000-00000000d991','00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c991','Countback Alpha Artist','Countback Alpha Song','final',2,'confirmed'),
  ('00000000-0000-4000-8000-00000000d992','00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c992','Countback Beta Artist','Countback Beta Song','final',1,'confirmed');

-- Both entries receive 23 Jury points and one 12. Alpha has one 10 while
-- Beta has no 10, so lexicographic countback must rank Alpha first before the
-- lower 8/3/1 distribution is even considered.
insert into public.jury_votes(
  edition_id,show_id,voter_country_id,receiving_country_id,points
) values
  ('00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c993','00000000-0000-4000-8000-00000000c991',12),
  ('00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c994','00000000-0000-4000-8000-00000000c991',10),
  ('00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c995','00000000-0000-4000-8000-00000000c991',1),
  ('00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c996','00000000-0000-4000-8000-00000000c992',12),
  ('00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c997','00000000-0000-4000-8000-00000000c992',8),
  ('00000000-0000-4000-8000-00000000e991','00000000-0000-4000-8000-00000000a991','00000000-0000-4000-8000-00000000c998','00000000-0000-4000-8000-00000000c992',3);

-- Force the historical fallback rank opposite the expected countback answer.
-- A scorer that still collapses countback to top-score count will preserve Beta
-- first; the repaired canonical authority must override it from vote truth.
update public.results
set final_rank = case country_id
  when '00000000-0000-4000-8000-00000000c991'::uuid then 2
  when '00000000-0000-4000-8000-00000000c992'::uuid then 1
  else final_rank
end
where show_id='00000000-0000-4000-8000-00000000a991'::uuid;

select public.sync_show_results_from_votes('00000000-0000-4000-8000-00000000a991'::uuid);

do $assert$
declare
  alpha_points integer;
  beta_points integer;
  alpha_rank integer;
  beta_rank integer;
begin
  select total_points, final_rank into alpha_points, alpha_rank
  from public.results
  where show_id='00000000-0000-4000-8000-00000000a991'::uuid
    and country_id='00000000-0000-4000-8000-00000000c991'::uuid;

  select total_points, final_rank into beta_points, beta_rank
  from public.results
  where show_id='00000000-0000-4000-8000-00000000a991'::uuid
    and country_id='00000000-0000-4000-8000-00000000c992'::uuid;

  if alpha_points is distinct from 23 or beta_points is distinct from 23 then
    raise exception 'countback fixture totals diverged: alpha %, beta %', alpha_points, beta_points;
  end if;
  if alpha_rank is distinct from 1 or beta_rank is distinct from 2 then
    raise exception 'full countback did not override opposite historical rank: alpha %, beta %', alpha_rank, beta_rank;
  end if;
end
$assert$;

rollback;
SQL

log "PASS: equal total + equal 12s are split by the next Jury award count (10s)"
