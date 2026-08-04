-- 1. canonical entity table
CREATE TABLE public.contest_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.editions(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('global','custom')),
  country_id uuid REFERENCES public.countries(id) ON DELETE RESTRICT,
  display_name text NOT NULL,
  abbreviation text NOT NULL,
  flag_image text,
  region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contest_entities_identity_chk CHECK (
    (entity_type = 'global' AND country_id IS NOT NULL)
    OR (entity_type = 'custom' AND country_id IS NULL)
  ),
  CONSTRAINT contest_entities_name_chk CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT contest_entities_abbr_chk CHECK (length(btrim(abbreviation)) > 0)
);

CREATE UNIQUE INDEX contest_entities_edition_country_key
  ON public.contest_entities (edition_id, country_id) WHERE country_id IS NOT NULL;
CREATE UNIQUE INDEX contest_entities_edition_abbr_key
  ON public.contest_entities (edition_id, lower(btrim(abbreviation)));
CREATE INDEX contest_entities_edition_idx ON public.contest_entities (edition_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contest_entities TO authenticated;
GRANT SELECT ON public.contest_entities TO anon;
GRANT ALL ON public.contest_entities TO service_role;

ALTER TABLE public.contest_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contest entities organizer write" ON public.contest_entities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'organizer'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'organizer'::public.app_role));

CREATE POLICY "contest entities public read published" ON public.contest_entities
  FOR SELECT TO public
  USING (
    EXISTS (SELECT 1 FROM public.editions e WHERE e.id = contest_entities.edition_id AND e.published)
    OR EXISTS (SELECT 1 FROM public.shows s WHERE s.edition_id = contest_entities.edition_id AND s.published)
    OR public.has_role(auth.uid(), 'organizer'::public.app_role)
  );

CREATE TRIGGER contest_entities_updated_at BEFORE UPDATE ON public.contest_entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. backfill one global entity per existing (edition, country) pair
INSERT INTO public.contest_entities (edition_id, entity_type, country_id, display_name, abbreviation, flag_image, region)
SELECT DISTINCT ON (src.edition_id, src.country_id)
       src.edition_id, 'global', src.country_id, c.name, c.short_code, c.flag_image, c.region
FROM (
  SELECT edition_id, country_id FROM public.participants WHERE country_id IS NOT NULL
  UNION SELECT edition_id, receiving_country_id FROM public.jury_votes WHERE receiving_country_id IS NOT NULL
  UNION SELECT edition_id, voter_country_id FROM public.jury_votes WHERE voter_country_id IS NOT NULL
  UNION SELECT edition_id, country_id FROM public.televote_votes WHERE country_id IS NOT NULL
  UNION SELECT edition_id, country_id FROM public.results WHERE country_id IS NOT NULL
  UNION SELECT edition_id, country_id FROM public.voters WHERE country_id IS NOT NULL
) src
JOIN public.countries c ON c.id = src.country_id;

-- 3. nullable entity references
ALTER TABLE public.participants
  ADD COLUMN contest_entity_id uuid REFERENCES public.contest_entities(id) ON DELETE RESTRICT,
  ALTER COLUMN country_id DROP NOT NULL;
ALTER TABLE public.jury_votes
  ADD COLUMN receiving_entity_id uuid REFERENCES public.contest_entities(id) ON DELETE RESTRICT,
  ADD COLUMN voter_entity_id uuid REFERENCES public.contest_entities(id) ON DELETE RESTRICT,
  ALTER COLUMN receiving_country_id DROP NOT NULL;
ALTER TABLE public.televote_votes
  ADD COLUMN contest_entity_id uuid REFERENCES public.contest_entities(id) ON DELETE RESTRICT,
  ALTER COLUMN country_id DROP NOT NULL;
ALTER TABLE public.results
  ADD COLUMN contest_entity_id uuid REFERENCES public.contest_entities(id) ON DELETE RESTRICT,
  ALTER COLUMN country_id DROP NOT NULL;
ALTER TABLE public.voters
  ADD COLUMN contest_entity_id uuid REFERENCES public.contest_entities(id) ON DELETE RESTRICT;

-- 4. backfill references
UPDATE public.participants p SET contest_entity_id = e.id
  FROM public.contest_entities e
  WHERE e.edition_id = p.edition_id AND e.country_id = p.country_id AND p.contest_entity_id IS NULL;
UPDATE public.jury_votes j SET receiving_entity_id = e.id
  FROM public.contest_entities e
  WHERE e.edition_id = j.edition_id AND e.country_id = j.receiving_country_id AND j.receiving_entity_id IS NULL;
UPDATE public.jury_votes j SET voter_entity_id = e.id
  FROM public.contest_entities e
  WHERE e.edition_id = j.edition_id AND e.country_id = j.voter_country_id AND j.voter_entity_id IS NULL;
UPDATE public.televote_votes t SET contest_entity_id = e.id
  FROM public.contest_entities e
  WHERE e.edition_id = t.edition_id AND e.country_id = t.country_id AND t.contest_entity_id IS NULL;
UPDATE public.results r SET contest_entity_id = e.id
  FROM public.contest_entities e
  WHERE e.edition_id = r.edition_id AND e.country_id = r.country_id AND r.contest_entity_id IS NULL;
UPDATE public.voters v SET contest_entity_id = e.id
  FROM public.contest_entities e
  WHERE e.edition_id = v.edition_id AND e.country_id = v.country_id AND v.contest_entity_id IS NULL;

-- 5. identity + cross-edition guards
ALTER TABLE public.participants ADD CONSTRAINT participants_identity_chk
  CHECK (country_id IS NOT NULL OR contest_entity_id IS NOT NULL);
ALTER TABLE public.jury_votes ADD CONSTRAINT jury_votes_recipient_identity_chk
  CHECK (receiving_country_id IS NOT NULL OR receiving_entity_id IS NOT NULL);
ALTER TABLE public.televote_votes ADD CONSTRAINT televote_identity_chk
  CHECK (country_id IS NOT NULL OR contest_entity_id IS NOT NULL);
ALTER TABLE public.results ADD CONSTRAINT results_identity_chk
  CHECK (country_id IS NOT NULL OR contest_entity_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.assert_entity_edition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_ed uuid;
BEGIN
  FOR v_ed IN
    SELECT e.edition_id FROM public.contest_entities e
    WHERE e.id = ANY (ARRAY[
      CASE TG_TABLE_NAME WHEN 'jury_votes' THEN NEW.receiving_entity_id ELSE NEW.contest_entity_id END,
      CASE TG_TABLE_NAME WHEN 'jury_votes' THEN NEW.voter_entity_id ELSE NULL END
    ]::uuid[])
  LOOP
    IF v_ed <> NEW.edition_id THEN
      RAISE EXCEPTION 'Contest entity belongs to a different edition.' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER participants_entity_edition BEFORE INSERT OR UPDATE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.assert_entity_edition();
CREATE TRIGGER jury_votes_entity_edition BEFORE INSERT OR UPDATE ON public.jury_votes
  FOR EACH ROW EXECUTE FUNCTION public.assert_entity_edition();
CREATE TRIGGER televote_entity_edition BEFORE INSERT OR UPDATE ON public.televote_votes
  FOR EACH ROW EXECUTE FUNCTION public.assert_entity_edition();
CREATE TRIGGER results_entity_edition BEFORE INSERT OR UPDATE ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.assert_entity_edition();

-- 6. entity-scoped uniqueness (mirrors the existing country-scoped indexes)
CREATE UNIQUE INDEX participants_show_entity_key
  ON public.participants (show_id, contest_entity_id) WHERE show_id IS NOT NULL AND contest_entity_id IS NOT NULL;
CREATE UNIQUE INDEX televote_show_entity_key
  ON public.televote_votes (show_id, contest_entity_id) WHERE show_id IS NOT NULL AND contest_entity_id IS NOT NULL;
CREATE UNIQUE INDEX results_show_entity_key
  ON public.results (show_id, contest_entity_id) WHERE show_id IS NOT NULL AND contest_entity_id IS NOT NULL;
CREATE UNIQUE INDEX jury_votes_show_voter_entity_key
  ON public.jury_votes (show_id, COALESCE(voter_id, voter_entity_id, voter_country_id), receiving_entity_id)
  WHERE show_id IS NOT NULL AND receiving_entity_id IS NOT NULL;

CREATE INDEX participants_entity_idx ON public.participants (contest_entity_id);
CREATE INDEX jury_votes_receiving_entity_idx ON public.jury_votes (receiving_entity_id);
CREATE INDEX televote_entity_idx ON public.televote_votes (contest_entity_id);
CREATE INDEX results_entity_idx ON public.results (contest_entity_id);

-- 7. entity-aware transactional publishing
CREATE OR REPLACE FUNCTION public.publish_show_results(p_show_id uuid, p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_edition_id uuid;
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'organizer'::public.app_role) THEN
    RAISE EXCEPTION 'Only organizers can publish results.' USING ERRCODE = '42501';
  END IF;

  SELECT edition_id INTO v_edition_id FROM public.shows WHERE id = p_show_id;
  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION 'Show not found.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.results WHERE show_id = p_show_id;

  INSERT INTO public.results (edition_id, show_id, country_id, contest_entity_id, jury_points, televote_points, total_points, final_rank)
  SELECT v_edition_id,
         p_show_id,
         NULLIF(r->>'country_id', '')::uuid,
         NULLIF(r->>'contest_entity_id', '')::uuid,
         COALESCE((r->>'jury_points')::int, 0),
         COALESCE((r->>'televote_points')::int, 0),
         COALESCE((r->>'total_points')::int, 0),
         NULLIF(r->>'final_rank', '')::int
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;