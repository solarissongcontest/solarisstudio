CREATE TYPE public.app_role AS ENUM ('organizer','viewer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.organizer_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'organizer');
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "organizers read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'organizer'));
CREATE POLICY "bootstrap first organizer" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'organizer' AND NOT public.organizer_exists());
CREATE POLICY "organizers grant roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'organizer'));

DROP POLICY "countries authed write" ON public.countries;
DROP POLICY "editions authed write" ON public.editions;
DROP POLICY "participants authed write" ON public.participants;
DROP POLICY "jury authed write" ON public.jury_votes;
DROP POLICY "televote authed write" ON public.televote_votes;
DROP POLICY "results authed write" ON public.results;

CREATE POLICY "countries organizer write" ON public.countries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'organizer')) WITH CHECK (public.has_role(auth.uid(),'organizer'));
CREATE POLICY "editions organizer write" ON public.editions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'organizer')) WITH CHECK (public.has_role(auth.uid(),'organizer'));
CREATE POLICY "participants organizer write" ON public.participants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'organizer')) WITH CHECK (public.has_role(auth.uid(),'organizer'));
CREATE POLICY "jury organizer write" ON public.jury_votes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'organizer')) WITH CHECK (public.has_role(auth.uid(),'organizer'));
CREATE POLICY "televote organizer write" ON public.televote_votes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'organizer')) WITH CHECK (public.has_role(auth.uid(),'organizer'));
CREATE POLICY "results organizer write" ON public.results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'organizer')) WITH CHECK (public.has_role(auth.uid(),'organizer'));