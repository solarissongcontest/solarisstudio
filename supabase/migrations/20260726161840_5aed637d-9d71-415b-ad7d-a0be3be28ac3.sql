CREATE TABLE public.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL,
  flag_image TEXT,
  region TEXT NOT NULL DEFAULT 'Terra Solaris',
  accent_color TEXT NOT NULL DEFAULT '#7dd3fc',
  description TEXT,
  first_participation INTEGER,
  statistics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.countries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "countries public read" ON public.countries FOR SELECT USING (true);
CREATE POLICY "countries authed write" ON public.countries FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  host_country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  host_city TEXT,
  logo TEXT,
  theme_colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  jury_weight INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.editions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editions TO authenticated;
GRANT ALL ON public.editions TO service_role;
ALTER TABLE public.editions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "editions public read" ON public.editions FOR SELECT USING (true);
CREATE POLICY "editions authed write" ON public.editions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  artist TEXT NOT NULL,
  song TEXT NOT NULL,
  running_order INTEGER,
  semi_final TEXT NOT NULL DEFAULT 'final',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_id, country_id)
);
GRANT SELECT ON public.participants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants public read" ON public.participants FOR SELECT USING (true);
CREATE POLICY "participants authed write" ON public.participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.jury_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  voter_country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  receiving_country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK (points IN (1,2,3,4,5,6,7,8,10,12)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (voter_country_id <> receiving_country_id),
  UNIQUE (edition_id, voter_country_id, receiving_country_id),
  UNIQUE (edition_id, voter_country_id, points)
);
GRANT SELECT ON public.jury_votes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jury_votes TO authenticated;
GRANT ALL ON public.jury_votes TO service_role;
ALTER TABLE public.jury_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jury public read" ON public.jury_votes FOR SELECT USING (true);
CREATE POLICY "jury authed write" ON public.jury_votes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.televote_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_id, country_id)
);
GRANT SELECT ON public.televote_votes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.televote_votes TO authenticated;
GRANT ALL ON public.televote_votes TO service_role;
ALTER TABLE public.televote_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "televote public read" ON public.televote_votes FOR SELECT USING (true);
CREATE POLICY "televote authed write" ON public.televote_votes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  jury_points INTEGER NOT NULL DEFAULT 0,
  televote_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  final_rank INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_id, country_id)
);
GRANT SELECT ON public.results TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.results TO authenticated;
GRANT ALL ON public.results TO service_role;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "results public read" ON public.results FOR SELECT USING (true);
CREATE POLICY "results authed write" ON public.results FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE VIEW public.voting_history
WITH (security_invoker = true) AS
  SELECT j.edition_id, e.year, e.name AS edition_name, 'jury'::text AS source,
         j.voter_country_id, j.receiving_country_id, j.points
  FROM public.jury_votes j
  JOIN public.editions e ON e.id = j.edition_id;
GRANT SELECT ON public.voting_history TO anon, authenticated, service_role;