begin;

drop trigger if exists enforce_beta_test_submission_limit on public.beta_test_submissions;
drop function if exists public.enforce_beta_test_submission_limit();
drop index if exists public.beta_test_submissions_tester_name_unique;

commit;
