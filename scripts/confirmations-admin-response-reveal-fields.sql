-- Applied to the dedicated Confirmations Supabase project.
-- Keep reveal timing in the organizer bulk-sync snapshot so Solaris can protect
-- songs until the HOD publishes them or the exact reveal boundary is reached.

create or replace function public.admin_confirmation_responses()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  return coalesce(
    (
      select jsonb_agg(item order by submitted_at desc)
      from (
        select
          s.submitted_at,
          jsonb_build_object(
            'id', s.id,
            'country', s.country,
            'instagram_username', s.instagram_username,
            'participating', s.participating,
            'selection_method', s.selection_method,
            'entry_unknown', s.entry_unknown,
            'nf_entries_unknown', s.nf_entries_unknown,
            'reveal_date_type', s.reveal_date_type,
            'reveal_exact_date', s.reveal_exact_date,
            'reveal_approximate_text', s.reveal_approximate_text,
            'nf_result_date_type', s.nf_result_date_type,
            'nf_result_exact_date', s.nf_result_exact_date,
            'nf_result_approximate_text', s.nf_result_approximate_text,
            'reviewed', s.reviewed,
            'locked', s.locked,
            'editing_allowed', s.editing_allowed,
            'submitted_at', s.submitted_at,
            'updated_at', s.updated_at,
            'submission_rounds', case when r.id is null then null else jsonb_build_object(
              'id', r.id,
              'name', r.name,
              'edition_id', r.edition_id
            ) end,
            'editions', case when e.id is null then null else jsonb_build_object(
              'id', e.id,
              'name', e.name,
              'edition_number', e.edition_number
            ) end,
            'internal_entries', (
              select case when i.id is null then null else jsonb_build_object(
                'id', i.id,
                'artist', i.artist,
                'song_title', i.song_title,
                'song_url', i.song_url,
                'review_status', i.review_status,
                'review_reason', i.review_reason,
                'reviewed_at', i.reviewed_at
              ) end
              from public.internal_entries i
              where i.submission_id = s.id
              limit 1
            ),
            'national_finals', (
              select jsonb_build_object(
                'id', nf.id,
                'nf_name', nf.nf_name,
                'winning_entry_id', nf.winning_entry_id,
                'national_final_entries', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', nfe.id,
                      'artist', nfe.artist,
                      'song_title', nfe.song_title,
                      'song_url', nfe.song_url,
                      'review_status', nfe.review_status,
                      'review_reason', nfe.review_reason,
                      'reviewed_at', nfe.reviewed_at,
                      'removed', nfe.removed,
                      'position', nfe.position
                    ) order by nfe.position
                  )
                  from public.national_final_entries nfe
                  where nfe.national_final_id = nf.id
                ), '[]'::jsonb)
              )
              from public.national_finals nf
              where nf.submission_id = s.id
              limit 1
            )
          ) as item
        from public.submissions s
        left join public.submission_rounds r on r.id = s.round_id
        left join public.editions e on e.id = s.edition_id
      ) q
    ),
    '[]'::jsonb
  );
end;
$$;
