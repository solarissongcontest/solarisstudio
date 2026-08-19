begin;

create table if not exists public.admin_beta_test_submissions (
  id uuid primary key default gen_random_uuid(),
  tester_name text not null check (length(btrim(tester_name)) between 1 and 120),
  device text not null check (device in ('Phone', 'Tablet', 'Laptop', 'Desktop')),
  browser text,
  familiarity text,
  answers jsonb not null default '{}'::jsonb,
  bug_reports jsonb not null default '[]'::jsonb,
  screenshot_paths text[] not null default '{}'::text[],
  user_agent text,
  form_version integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.admin_beta_test_submissions enable row level security;

revoke all on table public.admin_beta_test_submissions from anon, authenticated;
grant insert, select on table public.admin_beta_test_submissions to authenticated;

drop policy if exists "Organizers can submit admin beta feedback" on public.admin_beta_test_submissions;
create policy "Organizers can submit admin beta feedback"
on public.admin_beta_test_submissions
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'organizer')
  and length(btrim(tester_name)) between 1 and 120
  and device in ('Phone', 'Tablet', 'Laptop', 'Desktop')
  and jsonb_typeof(answers) = 'object'
  and jsonb_typeof(bug_reports) = 'array'
);

drop policy if exists "Organizers can read admin beta feedback" on public.admin_beta_test_submissions;
create policy "Organizers can read admin beta feedback"
on public.admin_beta_test_submissions
for select
to authenticated
using (public.has_role(auth.uid(), 'organizer'));

create index if not exists admin_beta_test_submissions_created_at_idx
  on public.admin_beta_test_submissions (created_at desc);

commit;
