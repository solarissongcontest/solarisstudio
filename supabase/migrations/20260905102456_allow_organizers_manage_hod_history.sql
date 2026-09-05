create policy "organizers can manage hod people"
on public.delegation_people
for all
to authenticated
using (public.has_role((select auth.uid()), 'organizer'::public.app_role))
with check (public.has_role((select auth.uid()), 'organizer'::public.app_role));

create policy "organizers can manage hod assignments"
on public.delegation_hod_assignments
for all
to authenticated
using (public.has_role((select auth.uid()), 'organizer'::public.app_role))
with check (public.has_role((select auth.uid()), 'organizer'::public.app_role));
