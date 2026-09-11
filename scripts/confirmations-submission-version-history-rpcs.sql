-- Applied to the dedicated Confirmations Supabase project.
-- Exposes read-only submission version history to Solaris organizers through
-- the existing cross-project organizer identity bridge. Raw legacy snapshots
-- contain IP/session/recovery fields, so the detail RPC whitelists only
-- contest-operational fields before any payload reaches the browser.

create or replace function public.admin_confirmation_version_summary()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'submission_id', q.submission_id,
        'version_count', q.version_count,
        'latest_created_at', q.latest_created_at
      )
      order by q.latest_created_at desc
    )
    from (
      select
        v.submission_id,
        count(*)::integer as version_count,
        max(v.created_at) as latest_created_at
      from public.submission_versions v
      group by v.submission_id
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_confirmation_versions(_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  if not exists (select 1 from public.submissions where id = _submission_id) then
    raise exception 'Submission not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'submission_id', v.submission_id,
        'version', v.version,
        'created_at', v.created_at,
        'snapshot', jsonb_build_object(
          'submission', jsonb_build_object(
            'participating', v.snapshot #> '{submission,participating}',
            'selection_method', v.snapshot #> '{submission,selection_method}',
            'entry_unknown', v.snapshot #> '{submission,entry_unknown}',
            'nf_entries_unknown', v.snapshot #> '{submission,nf_entries_unknown}',
            'reveal_date_type', v.snapshot #> '{submission,reveal_date_type}',
            'reveal_exact_date', v.snapshot #> '{submission,reveal_exact_date}',
            'reveal_approximate_text', v.snapshot #> '{submission,reveal_approximate_text}',
            'nf_date_type', v.snapshot #> '{submission,nf_date_type}',
            'nf_exact_date', v.snapshot #> '{submission,nf_exact_date}',
            'nf_approximate_text', v.snapshot #> '{submission,nf_approximate_text}',
            'nf_result_date_type', v.snapshot #> '{submission,nf_result_date_type}',
            'nf_result_exact_date', v.snapshot #> '{submission,nf_result_exact_date}',
            'nf_result_approximate_text', v.snapshot #> '{submission,nf_result_approximate_text}'
          ),
          'internal', case
            when jsonb_typeof(v.snapshot -> 'internal') = 'object' then jsonb_build_object(
              'artist', v.snapshot #> '{internal,artist}',
              'song_title', v.snapshot #> '{internal,song_title}',
              'song_url', v.snapshot #> '{internal,song_url}',
              'preview_start', v.snapshot #> '{internal,preview_start}',
              'preview_end', v.snapshot #> '{internal,preview_end}',
              'final_clip_start', v.snapshot #> '{internal,final_clip_start}',
              'final_clip_end', v.snapshot #> '{internal,final_clip_end}',
              'replacement_video_required', v.snapshot #> '{internal,replacement_video_required}',
              'replacement_video_url', v.snapshot #> '{internal,replacement_video_url}'
            )
            else null
          end,
          'national_final', case
            when jsonb_typeof(v.snapshot -> 'national_final') = 'object' then jsonb_build_object(
              'nf_name', v.snapshot #> '{national_final,nf_name}',
              'expected_entry_count', v.snapshot #> '{national_final,expected_entry_count}',
              'winning_entry_id', v.snapshot #> '{national_final,winning_entry_id}'
            )
            else null
          end,
          'nf_entries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'artist', item.entry -> 'artist',
                'song_title', item.entry -> 'song_title',
                'song_url', item.entry -> 'song_url',
                'position', item.entry -> 'position',
                'removed', item.entry -> 'removed'
              )
              order by item.ordinality
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(v.snapshot -> 'nf_entries') = 'array' then v.snapshot -> 'nf_entries'
                else '[]'::jsonb
              end
            ) with ordinality as item(entry, ordinality)
          ), '[]'::jsonb)
        )
      )
      order by v.version asc
    )
    from public.submission_versions v
    where v.submission_id = _submission_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_confirmation_version_summary() from public;
revoke all on function public.admin_confirmation_versions(uuid) from public;

grant execute on function public.admin_confirmation_version_summary() to anon, authenticated, service_role;
grant execute on function public.admin_confirmation_versions(uuid) to anon, authenticated, service_role;
