begin;

create unique index if not exists beta_test_submissions_tester_name_unique
  on public.beta_test_submissions (lower(btrim(tester_name)));

create or replace function public.enforce_beta_test_submission_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.beta_test_submissions) >= 5 then
    raise exception 'The Solaris Studio public beta test has already received all 5 responses.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_beta_test_submission_limit() from public, anon, authenticated;

drop trigger if exists enforce_beta_test_submission_limit on public.beta_test_submissions;
create trigger enforce_beta_test_submission_limit
before insert on public.beta_test_submissions
for each row execute function public.enforce_beta_test_submission_limit();

commit;
