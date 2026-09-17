begin;

-- Permission Engine v2 Phase 17: remove the remaining direct Organizer gates
-- from RLS without changing the surrounding policy semantics.
--
-- The migration intentionally preserves owner/public/validation branches and
-- replaces only the canonical legacy has_role(... organizer ...) predicate.
-- Raw televoting tables remain a global voting-manager surface; edition-scoped
-- callers should continue to use the governed RPCs. Prediction rounds and
-- Solaris televoting bindings can resolve a canonical edition directly and are
-- therefore scoped.

do $cutover$
declare
  r record;
  v_capability text;
  v_guard text;
  v_qual text;
  v_check text;
  v_sql text;
  v_count integer := 0;
  v_remaining integer;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where coalesce(qual, '') ilike '%has_role%'
       or coalesce(with_check, '') ilike '%has_role%'
    order by schemaname, tablename, policyname
  loop
    v_capability := case
      when r.schemaname = 'televoting' then 'voting.manage'
      when r.schemaname = 'storage' and r.policyname = 'Organizers can read beta screenshots' then 'edition.manage'
      when r.schemaname = 'storage' and r.policyname like 'country media bucket owner %' then 'entry.edit'
      when r.schemaname = 'storage' and r.policyname like 'organizers % edition artwork' then 'edition.manage'
      when r.schemaname = 'public' and r.tablename in ('prediction_rounds', 'televoting_round_bindings') then 'voting.manage'
      when r.schemaname = 'public' and r.tablename in ('edit_tokens', 'internal_entries') then 'entry.edit'
      when r.schemaname = 'public' and r.tablename in ('integration_events', 'integration_links') then 'rollout.manage'
      when r.schemaname = 'public' and r.tablename in (
        'admin_beta_test_submissions', 'admin_deadlines', 'admin_notifications',
        'admin_preferences', 'beta2_test_submissions', 'beta_test_submissions',
        'content_events', 'themes'
      ) then 'edition.manage'
      else null
    end;

    if v_capability is null then
      raise exception 'Unmapped legacy RLS policy %.%.% (%): refusing cutover',
        r.schemaname, r.tablename, r.policyname, r.cmd;
    end if;

    v_guard := case
      when r.schemaname = 'public' and r.tablename = 'prediction_rounds' then
        'public.studio2_access_allowed(''voting.manage'', (select s.edition_id from public.shows s where s.id = prediction_rounds.show_id), false)'
      when r.schemaname = 'public' and r.tablename = 'televoting_round_bindings' then
        'public.studio2_access_allowed(''voting.manage'', edition_id, false)'
      else
        format('public.studio2_access_allowed(%L, NULL::uuid, false)', v_capability)
    end;

    v_qual := r.qual;
    v_check := r.with_check;

    if v_qual is not null then
      v_qual := replace(v_qual,
        'has_role(auth.uid(), ''organizer''::app_role)', v_guard);
      v_qual := replace(v_qual,
        'has_role(( SELECT auth.uid() AS uid), ''organizer''::app_role)', v_guard);
      v_qual := replace(v_qual,
        'public.has_role(auth.uid(), ''organizer''::public.app_role)', v_guard);
      v_qual := replace(v_qual,
        'public.has_role(( SELECT auth.uid() AS uid), ''organizer''::public.app_role)', v_guard);
    end if;

    if v_check is not null then
      v_check := replace(v_check,
        'has_role(auth.uid(), ''organizer''::app_role)', v_guard);
      v_check := replace(v_check,
        'has_role(( SELECT auth.uid() AS uid), ''organizer''::app_role)', v_guard);
      v_check := replace(v_check,
        'public.has_role(auth.uid(), ''organizer''::public.app_role)', v_guard);
      v_check := replace(v_check,
        'public.has_role(( SELECT auth.uid() AS uid), ''organizer''::public.app_role)', v_guard);
    end if;

    if coalesce(v_qual, '') ilike '%has_role%'
       or coalesce(v_check, '') ilike '%has_role%' then
      raise exception 'Legacy role predicate survived RLS rewrite for %.%.%',
        r.schemaname, r.tablename, r.policyname;
    end if;

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.cmd in ('SELECT', 'DELETE') then
      v_sql := v_sql || format(' using (%s)', v_qual);
    elsif r.cmd = 'INSERT' then
      v_sql := v_sql || format(' with check (%s)', v_check);
    elsif r.cmd in ('UPDATE', 'ALL') then
      if v_qual is not null then
        v_sql := v_sql || format(' using (%s)', v_qual);
      end if;
      if v_check is not null then
        v_sql := v_sql || format(' with check (%s)', v_check);
      end if;
    else
      raise exception 'Unexpected policy command % for %.%.%',
        r.cmd, r.schemaname, r.tablename, r.policyname;
    end if;

    execute v_sql;
    v_count := v_count + 1;
  end loop;

  if v_count <> 43 then
    raise exception 'Expected 43 direct legacy RLS policies, found %; refusing cutover', v_count;
  end if;

  select count(*)::integer
  into v_remaining
  from pg_policies
  where coalesce(qual, '') ilike '%has_role%'
     or coalesce(with_check, '') ilike '%has_role%';

  if v_remaining <> 0 then
    raise exception 'Legacy role predicates remain in % RLS policies after cutover', v_remaining;
  end if;
end
$cutover$;

notify pgrst, 'reload schema';

commit;
