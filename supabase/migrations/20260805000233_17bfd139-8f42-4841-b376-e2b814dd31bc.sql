-- 1. Voter identity may also be a custom participating nation
ALTER TABLE public.jury_votes DROP CONSTRAINT IF EXISTS jury_votes_voter_identity_check;
ALTER TABLE public.jury_votes ADD CONSTRAINT jury_votes_voter_identity_check
  CHECK (voter_id IS NOT NULL OR voter_country_id IS NOT NULL OR voter_entity_id IS NOT NULL);

-- 2. One canonical uniqueness rule instead of three overlapping ones
DROP INDEX IF EXISTS public.jury_votes_show_voter_recipient_key;
DROP INDEX IF EXISTS public.jury_votes_show_voter_points_key;
DROP INDEX IF EXISTS public.jury_votes_show_voter_entity_key;
DROP INDEX IF EXISTS public.jury_votes_edition_voter_recipient_key;
DROP INDEX IF EXISTS public.jury_votes_edition_voter_points_key;

CREATE UNIQUE INDEX jury_votes_show_voter_recipient_key ON public.jury_votes
  (show_id, COALESCE(voter_id, voter_entity_id, voter_country_id), COALESCE(receiving_entity_id, receiving_country_id))
  WHERE show_id IS NOT NULL;
CREATE UNIQUE INDEX jury_votes_show_voter_points_key ON public.jury_votes
  (show_id, COALESCE(voter_id, voter_entity_id, voter_country_id), points)
  WHERE show_id IS NOT NULL;
CREATE UNIQUE INDEX jury_votes_edition_voter_recipient_key ON public.jury_votes
  (edition_id, COALESCE(voter_id, voter_entity_id, voter_country_id), COALESCE(receiving_entity_id, receiving_country_id))
  WHERE show_id IS NULL;
CREATE UNIQUE INDEX jury_votes_edition_voter_points_key ON public.jury_votes
  (edition_id, COALESCE(voter_id, voter_entity_id, voter_country_id), points)
  WHERE show_id IS NULL;

-- 3. Transactional ballot assignment
CREATE OR REPLACE FUNCTION public.assign_jury_vote(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_voter_key uuid := COALESCE(p_voter_id, p_voter_entity_id, p_voter_country_id);
  v_recv_key uuid := COALESCE(p_receiving_entity_id, p_receiving_country_id);
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'organizer'::public.app_role) THEN
    RAISE EXCEPTION 'Only organizers can enter jury votes.' USING ERRCODE = '42501';
  END IF;
  IF v_voter_key IS NULL OR v_recv_key IS NULL OR p_points IS NULL THEN
    RAISE EXCEPTION 'A jury vote needs a voting entity, a recipient and a point value.' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.jury_votes j
  WHERE j.edition_id = p_edition_id
    AND j.show_id IS NOT DISTINCT FROM p_show_id
    AND COALESCE(j.voter_id, j.voter_entity_id, j.voter_country_id) = v_voter_key
    AND (
      j.points = p_points
      OR COALESCE(j.receiving_entity_id, j.receiving_country_id) = v_recv_key
    );

  INSERT INTO public.jury_votes (
    edition_id, show_id, voter_id, voter_country_id, voter_entity_id,
    receiving_country_id, receiving_entity_id, points
  ) VALUES (
    p_edition_id, p_show_id, p_voter_id, p_voter_country_id, p_voter_entity_id,
    p_receiving_country_id, p_receiving_entity_id, p_points
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_jury_vote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_jury_vote(uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer) TO authenticated;

-- 4. Clearing one point value transactionally
CREATE OR REPLACE FUNCTION public.clear_jury_point(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_points integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_voter_key uuid := COALESCE(p_voter_id, p_voter_entity_id, p_voter_country_id);
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'organizer'::public.app_role) THEN
    RAISE EXCEPTION 'Only organizers can change jury votes.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.jury_votes j
  WHERE j.edition_id = p_edition_id
    AND j.show_id IS NOT DISTINCT FROM p_show_id
    AND COALESCE(j.voter_id, j.voter_entity_id, j.voter_country_id) = v_voter_key
    AND j.points = p_points;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_jury_point(uuid, uuid, uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_jury_point(uuid, uuid, uuid, uuid, uuid, integer) TO authenticated;