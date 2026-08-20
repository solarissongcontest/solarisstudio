begin;

-- Keep every existing Beta 1 response for the archive/comparison dashboard,
-- but only accept the new full Beta 2.0 form from this point onward.
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

comment on table public.beta_test_submissions is
  'Public Solaris Studio beta feedback. Beta 1 data is retained; new public submissions must use form version 4 (Beta 2.0).';

commit;
