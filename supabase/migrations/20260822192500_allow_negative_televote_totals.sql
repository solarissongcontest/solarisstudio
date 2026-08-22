alter table public.televote_votes
  drop constraint if exists televote_votes_points_check;

comment on column public.televote_votes.points is
  'Official aggregate televote total for the entry. May be negative when sanctions or penalties reduce the entry below zero.';
