begin;

-- Beta 1 remains exactly where it is for the archive dashboard.
-- New Beta 2.0 submissions are redirected into their own table so the two
-- rounds can be compared without mixing different questionnaires.

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
grant select on table public.beta2_test_submissions to authenticated;

drop policy if exists "Organizers can read Beta 2 feedback" on public.beta2_test_submissions;
create policy "Organizers can read Beta 2 feedback"
on public.beta2_test_submissions
for select
to authenticated
using (public.has_role(auth.uid(), 'organizer'));

create index if not exists beta2_test_submissions_created_at_idx
  on public.beta2_test_submissions (created_at desc);

-- Close Beta 1 and the temporary seven-section v3 form. Only version 4 is
-- accepted by the old public endpoint, and those rows are immediately routed
-- into the dedicated Beta 2 table instead of being stored in the Beta 1 archive.
alter table public.beta_test_submissions
  alter column form_version set default 4;

drop policy if exists "Public beta testers can submit feedback" on public.beta_test_submissions;
create policy "Public beta testers can submit feedback"
on public.beta_test_submissions
for insert
to anon, authenticated
with check (
  form_version = 4
  and length(btrim(tester_name)) between 1 and 120
  and device in ('Phone', 'Tablet', 'Laptop', 'Desktop')
  and jsonb_typeof(answers) = 'object'
  and jsonb_typeof(bug_reports) = 'array'
);

create or replace function public.route_beta2_submission()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if new.form_version <> 4 then
    raise exception 'This beta round is closed';
  end if;

  insert into public.beta2_test_submissions (
    id,
    tester_name,
    device,
    browser,
    familiarity,
    answers,
    bug_reports,
    screenshot_paths,
    user_agent,
    form_version,
    created_at
  ) values (
    new.id,
    new.tester_name,
    new.device,
    new.browser,
    new.familiarity,
    new.answers,
    new.bug_reports,
    new.screenshot_paths,
    new.user_agent,
    4,
    new.created_at
  );

  return null;
end;
$function$;

revoke all on function public.route_beta2_submission() from public, anon, authenticated;

drop trigger if exists beta2_submission_router on public.beta_test_submissions;
create trigger beta2_submission_router
before insert on public.beta_test_submissions
for each row
execute function public.route_beta2_submission();

comment on table public.beta_test_submissions is
  'Closed Beta 1 archive. Existing responses are retained. New form-version-4 submissions are stored in beta2_test_submissions.';
comment on table public.beta2_test_submissions is
  'Solaris Studio Beta 2.0 feedback. Kept separate from Beta 1 for clean before/after analysis.';

commit;
