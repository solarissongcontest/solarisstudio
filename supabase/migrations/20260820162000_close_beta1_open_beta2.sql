begin;

-- Keep every Beta 1 response exactly where it is, but close that table to
-- public writes. Beta 2.0 uses its own table so the two questionnaires can be
-- compared without mixing incompatible answers.

create table if not exists public.beta2_test_submissions (
  id uuid primary key default gen_random_uuid(),
  tester_name text not null check (length(btrim(tester_name)) between 1 and 120),
  device text not null check (device in ('Phone', 'Tablet', 'Laptop', 'Desktop')),
  browser text,
  familiarity text,
  answers jsonb not null default '{}'::jsonb,
  bug_reports jsonb not null default '[]'::jsonb,
  screenshot_paths text[] not null default '{}'::text[],
  user_agent text,
  form_version integer not null default 4 check (form_version = 4),
  created_at timestamptz not null default now()
);

alter table public.beta2_test_submissions enable row level security;

revoke all on table public.beta2_test_submissions from anon, authenticated;
grant insert on table public.beta2_test_submissions to anon, authenticated;
grant select on table public.beta2_test_submissions to authenticated;

drop policy if exists "Public Beta 2 testers can submit feedback" on public.beta2_test_submissions;
create policy "Public Beta 2 testers can submit feedback"
on public.beta2_test_submissions
for insert
to anon, authenticated
with check (
  form_version = 4
  and length(btrim(tester_name)) between 1 and 120
  and device in ('Phone', 'Tablet', 'Laptop', 'Desktop')
  and jsonb_typeof(answers) = 'object'
  and jsonb_typeof(bug_reports) = 'array'
);

drop policy if exists "Organizers can read Beta 2 feedback" on public.beta2_test_submissions;
create policy "Organizers can read Beta 2 feedback"
on public.beta2_test_submissions
for select
to authenticated
using (public.has_role(auth.uid(), 'organizer'));

create index if not exists beta2_test_submissions_created_at_idx
  on public.beta2_test_submissions (created_at desc);

-- Beta 1 is now an archive. Cached Beta 1 or temporary v3 forms cannot add new
-- rows even if someone still has an old page open.
drop policy if exists "Public beta testers can submit feedback" on public.beta_test_submissions;
revoke insert on table public.beta_test_submissions from anon, authenticated;

comment on table public.beta_test_submissions is
  'Closed Solaris Studio Beta 1 archive. Existing responses are retained and public inserts are disabled.';
comment on table public.beta2_test_submissions is
  'Solaris Studio Beta 2.0 feedback. Kept separate from Beta 1 for clean before/after analysis.';

commit;
