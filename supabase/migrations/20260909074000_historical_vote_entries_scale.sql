alter table televoting.vote_submissions
  add column if not exists is_historical boolean not null default false;

alter table televoting.vote_entries
  add column if not exists is_historical boolean not null default false;

alter table televoting.vote_entries
  drop constraint if exists vote_entries_points_check;

alter table televoting.vote_entries
  add constraint vote_entries_points_check
  check (points >= 1 and (is_historical or points <= 10));

create index if not exists televoting_vs_historical_idx
  on televoting.vote_submissions (round_id, is_historical);

comment on column televoting.vote_submissions.is_historical is
  'True only for organizer-imported historical ballots used for long-term analytics; never set by normal public voting.';
comment on column televoting.vote_entries.is_historical is
  'Allows exact legacy score scales above the modern 1-10 ceiling only for historical analytics rows.';
