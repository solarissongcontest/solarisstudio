-- Applied to the dedicated Confirmations Supabase project.
-- Cache auth.uid() as an initplan value instead of re-evaluating it per row.

drop policy if exists submission_versions_organizer_select on public.submission_versions;
create policy submission_versions_organizer_select
on public.submission_versions
for select
to authenticated
using (public.has_role((select auth.uid()), 'admin'::public.app_role));
