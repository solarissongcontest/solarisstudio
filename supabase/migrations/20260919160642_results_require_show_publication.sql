drop policy if exists "solaris consolidated anon read" on public.results;
create policy "solaris consolidated anon read"
on public.results
for select
to anon
using (
  (
    show_id is not null
    and public.show_publication_enabled(show_id, 'results')
  )
  or public.studio2_access_allowed('results.preview', edition_id, false)
);

drop policy if exists "solaris consolidated authenticated read" on public.results;
create policy "solaris consolidated authenticated read"
on public.results
for select
to authenticated
using (
  public.studio2_access_allowed('results.verify', edition_id, true)
  or (
    (
      show_id is not null
      and public.show_publication_enabled(show_id, 'results')
    )
    or public.studio2_access_allowed('results.preview', edition_id, false)
  )
);

notify pgrst, 'reload schema';
