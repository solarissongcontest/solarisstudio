begin;

create table if not exists public.beta_test_submissions (
  id uuid primary key default gen_random_uuid(),
  tester_name text not null check (length(btrim(tester_name)) between 1 and 120),
  device text not null check (device in ('Phone', 'Tablet', 'Laptop', 'Desktop')),
  browser text,
  familiarity text,
  answers jsonb not null default '{}'::jsonb,
  bug_reports jsonb not null default '[]'::jsonb,
  screenshot_paths text[] not null default '{}'::text[],
  user_agent text,
  form_version integer not null default 2,
  created_at timestamptz not null default now()
);

alter table public.beta_test_submissions enable row level security;

revoke all on table public.beta_test_submissions from anon, authenticated;
grant insert on table public.beta_test_submissions to anon, authenticated;
grant select on table public.beta_test_submissions to authenticated;

drop policy if exists "Public beta testers can submit feedback" on public.beta_test_submissions;
create policy "Public beta testers can submit feedback"
on public.beta_test_submissions
for insert
to anon, authenticated
with check (
  length(btrim(tester_name)) between 1 and 120
  and device in ('Phone', 'Tablet', 'Laptop', 'Desktop')
  and jsonb_typeof(answers) = 'object'
  and jsonb_typeof(bug_reports) = 'array'
);

drop policy if exists "Organizers can read beta feedback" on public.beta_test_submissions;
create policy "Organizers can read beta feedback"
on public.beta_test_submissions
for select
to authenticated
using (public.has_role(auth.uid(), 'organizer'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'beta-feedback',
  'beta-feedback',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public beta testers can upload screenshots" on storage.objects;
create policy "Public beta testers can upload screenshots"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'beta-feedback');

drop policy if exists "Organizers can read beta screenshots" on storage.objects;
create policy "Organizers can read beta screenshots"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'beta-feedback'
  and public.has_role(auth.uid(), 'organizer')
);

create index if not exists beta_test_submissions_created_at_idx
  on public.beta_test_submissions (created_at desc);

commit;
