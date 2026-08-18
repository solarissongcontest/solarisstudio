grant usage on schema televoting to authenticated;
grant select, insert, update, delete on all tables in schema televoting to authenticated;
grant usage, select on all sequences in schema televoting to authenticated;

-- Televoting now lives in the same Solaris Studio Supabase project. Organizer
-- tools should use the signed-in Solaris organizer session rather than a
-- separate service-role secret in Cloudflare.
do $$
declare
  t text;
begin
  foreach t in array array[
    'countries','editions','rounds','round_countries','round_entries',
    'vote_submissions','vote_entries','anti_abuse_events','admin_audit_log',
    'vote_moderation_events','round_results','televote_aggregations',
    'televote_aggregation_participants','televote_aggregation_sources',
    'external_score_entries','external_score_entry_log','combined_televote_results',
    'combined_televote_component_results'
  ] loop
    execute format('drop policy if exists %I on televoting.%I', 'televoting organizer full access', t);
    execute format(
      'create policy %I on televoting.%I for all to authenticated using (public.has_role(auth.uid(), ''organizer''::public.app_role)) with check (public.has_role(auth.uid(), ''organizer''::public.app_role))',
      'televoting organizer full access', t
    );
  end loop;
end $$;
