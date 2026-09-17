begin;

-- Follow-up to the private RLS helper EXECUTE hotfix.
--
-- PostgreSQL does not guarantee boolean-expression evaluation order, so an
-- `auth.uid() is not null AND private_helper(...)` branch inside a policy that
-- also applies to anon is not a safe privilege boundary. Split the policies by
-- database role so anon can never encounter the authenticated-only helper.

drop policy if exists "public reads published prediction rounds"
on public.prediction_rounds;

drop policy if exists "authenticated reads prediction rounds"
on public.prediction_rounds;

create policy "public reads published prediction rounds"
on public.prediction_rounds
for select
to anon
using (
  status = any (array['open'::text, 'locked'::text, 'scoring'::text, 'scored'::text])
  and public.show_publication_enabled(show_id, 'participants'::text)
);

create policy "authenticated reads prediction rounds"
on public.prediction_rounds
for select
to authenticated
using (
  (
    status = any (array['open'::text, 'locked'::text, 'scoring'::text, 'scored'::text])
    and public.show_publication_enabled(show_id, 'participants'::text)
  )
  or private.studio2_show_access_allowed('voting.manage', show_id, false)
);

-- Structural verification: anon policy must not reference the private helper,
-- authenticated policy must contain the elevated voting.manage path.
do $verify$
declare
  v_anon_qual text;
  v_auth_qual text;
begin
  select qual into v_anon_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'prediction_rounds'
    and policyname = 'public reads published prediction rounds';

  select qual into v_auth_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'prediction_rounds'
    and policyname = 'authenticated reads prediction rounds';

  if v_anon_qual is null then
    raise exception 'anonymous Prediction read policy missing';
  end if;

  if v_anon_qual ilike '%studio2_show_access_allowed%' then
    raise exception 'anonymous Prediction read policy still references private helper';
  end if;

  if v_auth_qual is null
     or v_auth_qual not ilike '%studio2_show_access_allowed%voting.manage%' then
    raise exception 'authenticated Prediction elevated capability path missing';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
