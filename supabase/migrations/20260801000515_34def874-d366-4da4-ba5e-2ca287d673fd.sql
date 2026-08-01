-- 1. Restore EXECUTE on RLS helper functions (they are SECURITY DEFINER and return only booleans).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_exists() TO anon, authenticated;

-- 2. Replace edition-scoped uniqueness with show-scoped, voter-identity-aware uniqueness.
ALTER TABLE public.jury_votes DROP CONSTRAINT IF EXISTS jury_votes_edition_id_voter_country_id_points_key;
ALTER TABLE public.jury_votes DROP CONSTRAINT IF EXISTS jury_votes_edition_id_voter_country_id_receiving_country_id_key;
ALTER TABLE public.televote_votes DROP CONSTRAINT IF EXISTS televote_votes_edition_id_country_id_key;
ALTER TABLE public.results DROP CONSTRAINT IF EXISTS results_edition_id_country_id_key;

-- Canonical voter identity expression: modern voter_id preferred, legacy country fallback.
CREATE UNIQUE INDEX IF NOT EXISTS jury_votes_show_voter_recipient_key
  ON public.jury_votes (show_id, COALESCE(voter_id, voter_country_id), receiving_country_id)
  WHERE show_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jury_votes_show_voter_points_key
  ON public.jury_votes (show_id, COALESCE(voter_id, voter_country_id), points)
  WHERE show_id IS NOT NULL;
-- Legacy rows that predate shows stay constrained at edition level.
CREATE UNIQUE INDEX IF NOT EXISTS jury_votes_edition_voter_recipient_key
  ON public.jury_votes (edition_id, COALESCE(voter_id, voter_country_id), receiving_country_id)
  WHERE show_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS jury_votes_edition_voter_points_key
  ON public.jury_votes (edition_id, COALESCE(voter_id, voter_country_id), points)
  WHERE show_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS televote_votes_show_country_key
  ON public.televote_votes (show_id, country_id) WHERE show_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS televote_votes_edition_country_noshow_key
  ON public.televote_votes (edition_id, country_id) WHERE show_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS results_show_country_key
  ON public.results (show_id, country_id) WHERE show_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS results_edition_country_noshow_key
  ON public.results (edition_id, country_id) WHERE show_id IS NULL;

-- 3. Allow custom point scales instead of the hard-coded classic set.
ALTER TABLE public.jury_votes DROP CONSTRAINT IF EXISTS jury_votes_points_check;
ALTER TABLE public.jury_votes ADD CONSTRAINT jury_votes_points_positive CHECK (points > 0);

-- 4. Every ballot must carry an identifiable voter.
ALTER TABLE public.jury_votes DROP CONSTRAINT IF EXISTS jury_votes_voter_identity_check;
ALTER TABLE public.jury_votes ADD CONSTRAINT jury_votes_voter_identity_check
  CHECK (voter_id IS NOT NULL OR voter_country_id IS NOT NULL);

-- 5. Protect draft line-ups and jury identities.
DROP POLICY IF EXISTS "participants public read" ON public.participants;
CREATE POLICY "participants public read published" ON public.participants FOR SELECT USING (
  CASE
    WHEN show_id IS NOT NULL THEN EXISTS (SELECT 1 FROM public.shows s WHERE s.id = participants.show_id AND s.published)
    ELSE EXISTS (SELECT 1 FROM public.editions e WHERE e.id = participants.edition_id AND e.published)
  END
  OR public.has_role(auth.uid(), 'organizer'::public.app_role)
);

DROP POLICY IF EXISTS "voters public read" ON public.voters;
CREATE POLICY "voters public read published" ON public.voters FOR SELECT USING (
  CASE
    WHEN show_id IS NOT NULL THEN EXISTS (SELECT 1 FROM public.shows s WHERE s.id = voters.show_id AND s.published)
    ELSE EXISTS (SELECT 1 FROM public.editions e WHERE e.id = voters.edition_id AND e.published)
  END
  OR public.has_role(auth.uid(), 'organizer'::public.app_role)
);

-- 6. New themes are private until explicitly published.
ALTER TABLE public.themes ALTER COLUMN is_public SET DEFAULT false;