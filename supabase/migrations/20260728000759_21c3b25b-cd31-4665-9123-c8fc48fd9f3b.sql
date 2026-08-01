-- NOTE (production-hardening pass): this migration originally began by deleting
-- every row from results/jury_votes/televote_votes/participants/shows/editions to
-- clear demo data. That already ran once in this project, but replaying the
-- migration chain in a fresh or restored environment would have destroyed real
-- contest data. The destructive statements have been neutralised; demo resets now
-- live in scripts/reset-demo-data.sql and must never be run against production.

-- themes library
CREATE TABLE public.themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.themes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT ALL ON public.themes TO service_role;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "themes public read" ON public.themes FOR SELECT USING (is_public OR has_role(auth.uid(), 'organizer'::app_role));
CREATE POLICY "themes organizer write" ON public.themes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'organizer'::app_role)) WITH CHECK (has_role(auth.uid(), 'organizer'::app_role));
CREATE TRIGGER themes_updated_at BEFORE UPDATE ON public.themes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- editions: number-first identity
ALTER TABLE public.editions
  ADD COLUMN IF NOT EXISTS edition_number integer,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES public.themes(id) ON DELETE SET NULL;
ALTER TABLE public.editions ALTER COLUMN year DROP NOT NULL;

-- shows: independent config per show
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS voting_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS broadcast_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES public.themes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qualifier_count integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- participants: entry details optional
ALTER TABLE public.participants
  ALTER COLUMN artist DROP NOT NULL,
  ALTER COLUMN song DROP NOT NULL;
ALTER TABLE public.participants ALTER COLUMN artist SET DEFAULT NULL;
ALTER TABLE public.participants ALTER COLUMN song SET DEFAULT NULL;
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS qualified boolean,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS participants_show_idx ON public.participants(show_id);
CREATE INDEX IF NOT EXISTS jury_votes_show_idx ON public.jury_votes(show_id);
CREATE INDEX IF NOT EXISTS televote_show_idx ON public.televote_votes(show_id);
CREATE INDEX IF NOT EXISTS results_show_idx ON public.results(show_id);