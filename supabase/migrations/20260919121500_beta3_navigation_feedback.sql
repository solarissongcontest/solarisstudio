begin;

-- Beta 3 is a navigation/findability study and intentionally uses a dedicated
-- table. Beta 1 and Beta 2 remain immutable historical comparison sets.
create table if not exists public.beta3_test_submissions (
  id uuid primary key default gen_random_uuid(),
  tester_name text not null check (length(btrim(tester_name)) between 1 and 120),
  device text not null check (device in ('Phone', 'Tablet', 'Laptop', 'Desktop')),
  browser text,
  familiarity text,
  answers jsonb not null default '{}'::jsonb,
  bug_reports jsonb not null default '[]'::jsonb,
  screenshot_paths text[] not null default '{}'::text[],
  user_agent text,
  form_version integer not null default 5 check (form_version = 5),
  created_at timestamptz not null default now(),
  constraint beta3_test_submissions_answers_object_check
    check (jsonb_typeof(answers) = 'object'),
  constraint beta3_test_submissions_bug_reports_array_check
    check (jsonb_typeof(bug_reports) = 'array'),
  constraint beta3_test_submissions_answers_size_check
    check (octet_length(answers::text) <= 131072),
  constraint beta3_test_submissions_bug_reports_size_check
    check (octet_length(bug_reports::text) <= 131072)
);

alter table public.beta3_test_submissions enable row level security;

revoke all on table public.beta3_test_submissions from public, anon, authenticated;
grant insert on table public.beta3_test_submissions to anon, authenticated;
grant select on table public.beta3_test_submissions to authenticated;

drop policy if exists "Public Beta 3 testers can submit feedback"
  on public.beta3_test_submissions;
create policy "Public Beta 3 testers can submit feedback"
on public.beta3_test_submissions
for insert
to anon, authenticated
with check (
  form_version = 5
  and length(btrim(tester_name)) between 1 and 120
  and device in ('Phone', 'Tablet', 'Laptop', 'Desktop')
  and jsonb_typeof(answers) = 'object'
  and jsonb_typeof(bug_reports) = 'array'
  and octet_length(answers::text) <= 131072
  and octet_length(bug_reports::text) <= 131072
);

drop policy if exists "Organizers can read Beta 3 feedback"
  on public.beta3_test_submissions;
create policy "Organizers can read Beta 3 feedback"
on public.beta3_test_submissions
for select
to authenticated
using (public.has_role((select auth.uid()), 'organizer'::public.app_role));

create index if not exists beta3_test_submissions_created_at_idx
  on public.beta3_test_submissions (created_at desc);

comment on table public.beta3_test_submissions is
  'Solaris Studio Beta 3 navigation and findability study. Separate from Beta 1 and Beta 2 archives.';

commit;
