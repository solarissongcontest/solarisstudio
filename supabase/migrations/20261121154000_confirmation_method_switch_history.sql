begin;

-- Forward-only Confirmation method-switch repair.
-- Preserve the exact deployed submit_confirmation definition, grants and
-- SECURITY DEFINER properties. Do not replay an older 19 KB definition over
-- the current hosted implementation. The expected legacy destructive sites
-- are validated explicitly; an unknown runtime must FAIL CLOSED.
--
-- Deploy only after the S13/S14 migration frontier and exact catalog effects
-- have been separately reviewed on a sanitized local hosted-equivalent clone.
do $patch$
declare
  v_definition text;
  v_patched text;
  v_internal_pattern constant text :=
    'delete[[:space:]]+from[[:space:]]+public[.]internal_entries[[:space:]]+where[[:space:]]+submission_id[[:space:]]*=[[:space:]]*sub[.]id[[:space:]]*;';
  v_nf_pattern constant text :=
    'delete[[:space:]]+from[[:space:]]+public[.]national_finals[[:space:]]+where[[:space:]]+submission_id[[:space:]]*=[[:space:]]*sub[.]id[[:space:]]*;';
  v_internal_count integer;
  v_nf_count integer;
  v_guard_anchor constant text := E'  if is_edit then\n    snap := jsonb_build_object(';
  v_internal_anchor constant text := 'elsif sub.selection_method = ''internal'' then';
  v_nf_anchor constant text := 'elsif sub.selection_method = ''national_final'' then';
begin
  if to_regprocedure('public.submit_confirmation(jsonb)') is null
     or to_regclass('public.submission_versions') is null
     or to_regclass('public.national_final_entries') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'national_finals'
         and column_name = 'pending_winning_entry_id'
     ) then
    raise exception 'Confirmation method preservation requires the deployed version/audit and pending-winner contracts';
  end if;

  select pg_get_functiondef('public.submit_confirmation(jsonb)'::regprocedure)
    into v_definition;

  select count(*) into v_internal_count
    from regexp_matches(v_definition, v_internal_pattern, 'gi');
  select count(*) into v_nf_count
    from regexp_matches(v_definition, v_nf_pattern, 'gi');

  if v_internal_count <> 2 or v_nf_count <> 2
     or strpos(v_definition, v_guard_anchor) = 0
     or strpos(v_definition, v_internal_anchor) = 0
     or strpos(v_definition, v_nf_anchor) = 0 then
    raise exception 'Unexpected submit_confirmation function body: manual version-aware migration review required'
      using errcode = '55000';
  end if;

  -- These rows become inactive solely by the submissions.selection_method
  -- discriminator. Keep both methods' identities and exact-version history.
  v_patched := regexp_replace(v_definition, v_internal_pattern, 'null; /* inactive Internal history retained */', 'gi');
  v_patched := regexp_replace(v_patched, v_nf_pattern, 'null; /* inactive NF history retained */', 'gi');

  -- Do not permit ordinary delegation edits to rewrite an already published
  -- or lineup-bound entry. The governed Organizer correction flow owns these.
  v_patched := replace(v_patched, v_guard_anchor, $guard$
  if is_edit and exists (
    select 1
    from public.participants p
    join public.countries c on c.id = p.country_id
    where p.edition_id = r.edition_id
      and lower(btrim(c.name)) = lower(btrim(existing.country))
      and (p.publication_status = 'published' or p.show_id is not null)
  ) then
    raise exception 'Published or competition-locked entries require an Organizer correction'
      using errcode = '42501';
  end if;

$guard$ || v_guard_anchor);

  -- A previously accepted inactive method cannot acquire automatic approval
  -- by being selected again. The versioned review workflow must re-approve it.
  v_patched := replace(v_patched, v_internal_anchor, $internal$
elsif sub.selection_method = 'internal' then
    if is_edit and existing.selection_method is distinct from 'internal' then
      update public.internal_entries
      set review_status = 'pending',
          review_reason = null,
          reviewed_at = null,
          reviewed_by = null
      where submission_id = sub.id;
    end if;$internal$);

  v_patched := replace(v_patched, v_nf_anchor, $nf$
elsif sub.selection_method = 'national_final' then
    if is_edit and existing.selection_method is distinct from 'national_final' then
      -- Keep the old winner in submission_versions/review history, but do not
      -- auto-promote it again without an exact-version Organizer decision.
      update public.national_finals
      set winning_entry_id = null, pending_winning_entry_id = null
      where submission_id = sub.id;

      update public.national_final_entries candidate
      set review_status = 'pending',
          review_reason = null,
          reviewed_at = null,
          reviewed_by = null
      from public.national_finals nf
      where candidate.national_final_id = nf.id
        and nf.submission_id = sub.id
        and coalesce(candidate.removed, false) = false;
    end if;$nf$);

  if v_patched = v_definition
     or strpos(v_patched, 'inactive NF history retained') = 0
     or strpos(v_patched, 'inactive Internal history retained') = 0
     or strpos(v_patched, 'Published or competition-locked entries') = 0 then
    raise exception 'Confirmation method preservation patch did not apply completely'
      using errcode = '55000';
  end if;

  -- Replacing the existing function (not dropping it) preserves execute
  -- grants, owner and the current signature. No new direct writer is granted.
  execute v_patched;
end
$patch$;

commit;
