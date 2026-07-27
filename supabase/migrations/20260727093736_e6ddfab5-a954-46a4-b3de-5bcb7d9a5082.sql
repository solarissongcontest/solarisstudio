-- 1. countries: native name + unique code
ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS native_name text;
CREATE UNIQUE INDEX IF NOT EXISTS countries_short_code_key ON public.countries (short_code);
CREATE UNIQUE INDEX IF NOT EXISTS countries_name_key ON public.countries (name);

-- 2. editions: published flag
ALTER TABLE public.editions ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
UPDATE public.editions SET published = true WHERE status = 'completed';

-- 3. shows (sub events)
CREATE TABLE IF NOT EXISTS public.shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'semi-final',
  sort_order integer NOT NULL DEFAULT 1,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shows TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shows TO authenticated;
GRANT ALL ON public.shows TO service_role;

ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shows public read published"
  ON public.shows FOR SELECT
  USING (published OR public.has_role(auth.uid(), 'organizer'));

CREATE POLICY "shows organizer write"
  ON public.shows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'organizer'))
  WITH CHECK (public.has_role(auth.uid(), 'organizer'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_shows_updated_at ON public.shows;
CREATE TRIGGER update_shows_updated_at BEFORE UPDATE ON public.shows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. link existing data tables to shows
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE;
ALTER TABLE public.jury_votes ADD COLUMN IF NOT EXISTS show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE;
ALTER TABLE public.televote_votes ADD COLUMN IF NOT EXISTS show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE;

-- 5. cascade deletes from editions
ALTER TABLE public.participants DROP CONSTRAINT IF EXISTS participants_edition_id_fkey;
ALTER TABLE public.participants ADD CONSTRAINT participants_edition_id_fkey
  FOREIGN KEY (edition_id) REFERENCES public.editions(id) ON DELETE CASCADE;
ALTER TABLE public.jury_votes DROP CONSTRAINT IF EXISTS jury_votes_edition_id_fkey;
ALTER TABLE public.jury_votes ADD CONSTRAINT jury_votes_edition_id_fkey
  FOREIGN KEY (edition_id) REFERENCES public.editions(id) ON DELETE CASCADE;
ALTER TABLE public.televote_votes DROP CONSTRAINT IF EXISTS televote_votes_edition_id_fkey;
ALTER TABLE public.televote_votes ADD CONSTRAINT televote_votes_edition_id_fkey
  FOREIGN KEY (edition_id) REFERENCES public.editions(id) ON DELETE CASCADE;
ALTER TABLE public.results DROP CONSTRAINT IF EXISTS results_edition_id_fkey;
ALTER TABLE public.results ADD CONSTRAINT results_edition_id_fkey
  FOREIGN KEY (edition_id) REFERENCES public.editions(id) ON DELETE CASCADE;

-- 6. visibility helper
CREATE OR REPLACE FUNCTION public.scores_visible(_edition_id uuid, _show_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _show_id IS NOT NULL
      THEN EXISTS (SELECT 1 FROM public.shows s WHERE s.id = _show_id AND s.published)
    ELSE EXISTS (SELECT 1 FROM public.editions e WHERE e.id = _edition_id AND e.published)
  END;
$$;

-- 7. tighten public reads on score data
DROP POLICY IF EXISTS "jury public read" ON public.jury_votes;
CREATE POLICY "jury public read published"
  ON public.jury_votes FOR SELECT
  USING (public.scores_visible(edition_id, show_id) OR public.has_role(auth.uid(), 'organizer'));

DROP POLICY IF EXISTS "televote public read" ON public.televote_votes;
CREATE POLICY "televote public read published"
  ON public.televote_votes FOR SELECT
  USING (public.scores_visible(edition_id, show_id) OR public.has_role(auth.uid(), 'organizer'));

DROP POLICY IF EXISTS "results public read" ON public.results;
CREATE POLICY "results public read published"
  ON public.results FOR SELECT
  USING (public.scores_visible(edition_id, show_id) OR public.has_role(auth.uid(), 'organizer'));

DROP POLICY IF EXISTS "editions public read" ON public.editions;
CREATE POLICY "editions public read"
  ON public.editions FOR SELECT
  USING (published OR public.has_role(auth.uid(), 'organizer'));