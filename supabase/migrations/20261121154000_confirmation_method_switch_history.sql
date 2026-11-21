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
  -- Match the current PG17.11 hosted function contract exactly before editing
  -- generated DDL. Pattern matches alone do not prove the deployed semantics.
  if encode(sha256(convert_to(v_definition,'UTF8')),'hex')
     is distinct from '094afca871b8185f2eb877bfc9ccd9676dbfb7366b52656ff9d3f0af2f8de2e6' then
    raise exception 'submit_confirmation deployed definition fingerprint changed; independent compatibility review required'
      using errcode = '55000';
  end if;

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

  -- Only non-material corrections may pass a public/competition lock. Compare
  -- the effective values written by the pinned function, including defaults
  -- for omitted keys: a partial payload must never evade this guard.
  v_patched := replace(v_patched, v_guard_anchor, $guard$
  if is_edit and (
    exists (
      select 1 from public.national_finals nf
      where nf.submission_id = existing.id
        and (coalesce(nf.lineup_published, false) or coalesce(nf.results_published, false))
    )
    or exists (
      select 1 from public.participants p
      join public.countries c on c.id = p.country_id
      where p.edition_id = r.edition_id
        and lower(btrim(c.name)) = lower(btrim(existing.country))
        and (p.publication_status = 'published' or p.show_id is not null)
    )
  ) and (
    existing.country is distinct from coalesce(nullif(trim(payload ->> 'country'), ''), existing.country)
    or existing.country_account is distinct from nullif(trim(payload ->> 'country_account'), '')
    or existing.has_country_account is distinct from coalesce((payload ->> 'has_country_account')::boolean, false)
    or existing.participating is distinct from coalesce((payload ->> 'participating')::boolean, true)
    or existing.selection_method is distinct from nullif(payload ->> 'selection_method', '')
    or existing.entry_unknown is distinct from coalesce((payload ->> 'entry_unknown')::boolean, false)
    or existing.nf_entries_unknown is distinct from coalesce((payload ->> 'nf_entries_unknown')::boolean, false)
    or existing.reveal_date_type is distinct from nullif(payload ->> 'reveal_date_type', '')
    or existing.reveal_exact_date is distinct from nullif(payload ->> 'reveal_exact_date', '')::date
    or existing.reveal_approximate_text is distinct from nullif(payload ->> 'reveal_approximate_text', '')
    or existing.nf_date_type is distinct from nullif(payload ->> 'nf_date_type', '')
    or existing.nf_exact_date is distinct from nullif(payload ->> 'nf_exact_date', '')::date
    or existing.nf_approximate_text is distinct from nullif(payload ->> 'nf_approximate_text', '')
    or existing.nf_result_date_type is distinct from nullif(payload ->> 'nf_result_date_type', '')
    or existing.nf_result_exact_date is distinct from nullif(payload ->> 'nf_result_exact_date', '')::date
    or existing.nf_result_approximate_text is distinct from nullif(payload ->> 'nf_result_approximate_text', '')
    or exists (
      select 1 from public.internal_entries i
      where i.submission_id = existing.id and existing.selection_method = 'internal'
        and (
          jsonb_build_array(i.artist,i.song_title,i.song_url,i.preview_start,i.preview_end,
            i.final_clip_start,i.final_clip_end,coalesce(i.replacement_video_required,false),i.replacement_video_url)
          is distinct from
          jsonb_build_array(nullif(payload->>'artist',''),nullif(payload->>'song_title',''),
            nullif(payload->>'song_url',''),nullif(payload->>'preview_start',''),nullif(payload->>'preview_end',''),
            nullif(payload->>'final_clip_start',''),nullif(payload->>'final_clip_end',''),
            coalesce((payload->>'replacement_video_required')::boolean,false),nullif(payload->>'replacement_video_url',''))
        )
    )
    or exists (
      select 1 from public.national_finals nf
      left join public.national_final_entries winner on winner.id = coalesce(nf.pending_winning_entry_id,nf.winning_entry_id)
      where nf.submission_id = existing.id and existing.selection_method = 'national_final'
        and (
          nf.nf_name is distinct from nullif(payload->>'nf_name','')
          or nf.expected_entry_count is distinct from nullif(payload->>'expected_entry_count','')::integer
          or jsonb_build_array(winner.artist,winner.song_title,winner.preview_start,winner.preview_end,
              winner.final_clip_start,winner.final_clip_end,coalesce(winner.replacement_video_required,false),winner.replacement_video_url)
             is distinct from jsonb_build_array(nullif(payload->>'artist',''),nullif(payload->>'song_title',''),
              nullif(payload->>'preview_start',''),nullif(payload->>'preview_end',''),
              nullif(payload->>'final_clip_start',''),nullif(payload->>'final_clip_end',''),
              coalesce((payload->>'replacement_video_required')::boolean,false),nullif(payload->>'replacement_video_url',''))
          or (select coalesce(jsonb_agg(jsonb_build_array(e.artist,e.song_title,e.song_url) order by e.position),'[]'::jsonb)
              from public.national_final_entries e where e.national_final_id=nf.id and not coalesce(e.removed,false))
             is distinct from
             (select coalesce(jsonb_agg(jsonb_build_array(nullif(incoming.item->>'artist',''),nullif(incoming.item->>'song_title',''),nullif(incoming.item->>'song_url','')) order by incoming.ordinal),'[]'::jsonb)
              from jsonb_array_elements(coalesce(payload->'nf_entries','[]'::jsonb)) with ordinality incoming(item,ordinal))
        )
    )
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


-- The original duplicate checker treated every row in internal_entries and
-- national_final_entries as an active candidate. With preserved inactive
-- history that would falsely reject another country's legitimate entry and
-- leak historical song matches through duplicate checks. Preserve its
-- established cross-edition matching scope but restrict it to active methods.
do $duplicates$
declare
  v_definition text;
  v_patched text;
  v_internal_join constant text :=
    E'join public.submissions s on s.id = i.submission_id\n    where';
  v_nf_join constant text :=
    E'join public.submissions s on s.id = nf.submission_id\n    where';
  v_artist_or constant text :=
    E'public.normalize_entry_text(i.artist) = na\n        or public.normalize_entry_text(e.artist) = na';
begin
  if to_regprocedure('public.find_entry_duplicate(uuid,uuid,text,text,text)') is null then
    raise exception 'Missing canonical Confirmation duplicate checker' using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.find_entry_duplicate(uuid,uuid,text,text,text)'::regprocedure
  ) into v_definition;
  if encode(sha256(convert_to(v_definition,'UTF8')),'hex')
     is distinct from 'd0b41e6f807613cdbb11a020455ff4c13d5f96dd9adb9dd006b2a64b3915641f' then
    raise exception 'find_entry_duplicate deployed definition fingerprint changed; independent compatibility review required'
      using errcode = '55000';
  end if;

  if strpos(v_definition, v_internal_join) = 0
     or strpos(v_definition, v_nf_join) = 0
     or strpos(v_definition, v_artist_or) = 0 then
    raise exception 'Duplicate checker differs from reviewed migration baseline'
      using errcode = '55000';
  end if;

  v_patched := replace(
    v_definition, v_internal_join,
    E'join public.submissions s on s.id = i.submission_id\n    where s.selection_method = ''internal'' and s.participating = true and'
  );
  v_patched := replace(
    v_patched, v_nf_join,
    E'join public.submissions s on s.id = nf.submission_id\n    where s.selection_method = ''national_final'' and s.participating = true and'
  );
  v_patched := replace(
    v_patched, v_artist_or,
    E'(s.selection_method = ''internal'' and public.normalize_entry_text(i.artist) = na)\n        or (s.selection_method = ''national_final'' and public.normalize_entry_text(e.artist) = na)'
  );
  if v_patched = v_definition then
    raise exception 'Duplicate checker inactive-history filter was not applied'
      using errcode = '55000';
  end if;
  execute v_patched;
end
$duplicates$;


-- Organizer-only projections distinguish a staged participant winner from
-- "no winner". Exact-version review still owns canonical winning_entry_id.
-- Do not expose pending identity through anonymous/public projections.
do $organizer_read$
declare
  v_name regprocedure;
  v_definition text;
  v_patched text;
  v_anchor constant text := '''winning_entry_id'', nf.winning_entry_id,';
begin
  foreach v_name in array array[
    'public.admin_confirmation_response(uuid)'::regprocedure,
    'public.admin_confirmation_responses_for_edition(uuid,integer,integer)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_name) into v_definition;
    if (
      v_name = 'public.admin_confirmation_response(uuid)'::regprocedure
      and encode(sha256(convert_to(v_definition,'UTF8')),'hex')
        is distinct from 'fe4fde03547d6faf1ee32f2a7d796169d609d6e9cc46b8e256c68a524e954ce4'
    ) or (
      v_name = 'public.admin_confirmation_responses_for_edition(uuid,integer,integer)'::regprocedure
      and encode(sha256(convert_to(v_definition,'UTF8')),'hex')
        is distinct from '494f8e32b36946f932bcd2c9c8de15cad05de2d6dd6583167fb0a089b68c919a'
    ) then
      raise exception 'Organizer Confirmation projection deployed definition fingerprint changed: %', v_name
        using errcode = '55000';
    end if;
    if strpos(v_definition, v_anchor) = 0 then
      raise exception 'Organizer NF projection differs from reviewed contract: %', v_name
        using errcode = '55000';
    end if;
    v_patched := replace(
      v_definition, v_anchor,
      v_anchor || E'\n        ''pending_winning_entry_id'', nf.pending_winning_entry_id,'
    );
    execute v_patched;
  end loop;
end
$organizer_read$;

-- S13 registration is written transactionally with the reviewed repair.
-- This does not fabricate hosted migration-history rows or grant API writers.
select public.v3_register_migration_contract(
  'v3.confirmation.method-switch-history', 1, 'forward_fix_only', false, null,
  'Preserve inactive Internal/NF history, invalidate reactivated approvals and restrict duplicate matches to active selections'
);

notify pgrst, 'reload schema';
commit;
