CREATE TABLE public.voters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE,
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'country',
  flag_image text,
  accent_color text NOT NULL DEFAULT '#7dd3fc',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.voters TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voters TO authenticated;
GRANT ALL ON public.voters TO service_role;

ALTER TABLE public.voters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voters public read" ON public.voters FOR SELECT USING (true);
CREATE POLICY "voters organizer write" ON public.voters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'organizer'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'organizer'::app_role));

ALTER TABLE public.jury_votes ADD COLUMN voter_id uuid REFERENCES public.voters(id) ON DELETE CASCADE;
ALTER TABLE public.jury_votes ALTER COLUMN voter_country_id DROP NOT NULL;

CREATE INDEX idx_voters_edition ON public.voters(edition_id);
CREATE INDEX idx_voters_show ON public.voters(show_id);
CREATE INDEX idx_jury_votes_voter ON public.jury_votes(voter_id);