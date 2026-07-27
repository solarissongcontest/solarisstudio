DROP POLICY IF EXISTS "jury public read published" ON public.jury_votes;
CREATE POLICY "jury public read published"
  ON public.jury_votes FOR SELECT
  USING (
    CASE WHEN show_id IS NOT NULL
      THEN EXISTS (SELECT 1 FROM public.shows s WHERE s.id = show_id AND s.published)
      ELSE EXISTS (SELECT 1 FROM public.editions e WHERE e.id = edition_id AND e.published)
    END
    OR public.has_role(auth.uid(), 'organizer')
  );

DROP POLICY IF EXISTS "televote public read published" ON public.televote_votes;
CREATE POLICY "televote public read published"
  ON public.televote_votes FOR SELECT
  USING (
    CASE WHEN show_id IS NOT NULL
      THEN EXISTS (SELECT 1 FROM public.shows s WHERE s.id = show_id AND s.published)
      ELSE EXISTS (SELECT 1 FROM public.editions e WHERE e.id = edition_id AND e.published)
    END
    OR public.has_role(auth.uid(), 'organizer')
  );

DROP POLICY IF EXISTS "results public read published" ON public.results;
CREATE POLICY "results public read published"
  ON public.results FOR SELECT
  USING (
    CASE WHEN show_id IS NOT NULL
      THEN EXISTS (SELECT 1 FROM public.shows s WHERE s.id = show_id AND s.published)
      ELSE EXISTS (SELECT 1 FROM public.editions e WHERE e.id = edition_id AND e.published)
    END
    OR public.has_role(auth.uid(), 'organizer')
  );

DROP FUNCTION IF EXISTS public.scores_visible(uuid, uuid);