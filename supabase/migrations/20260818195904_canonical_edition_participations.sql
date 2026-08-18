CREATE OR REPLACE FUNCTION public.participant_same_edition_identity(
  p_edition_id uuid,
  p_country_id uuid,
  p_contest_entity_id uuid,
  q_edition_id uuid,
  q_country_id uuid,
  q_contest_entity_id uuid
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_edition_id = q_edition_id
    AND (
      (p_country_id IS NOT NULL AND q_country_id = p_country_id)
      OR (
        p_country_id IS NULL
        AND q_country_id IS NULL
        AND p_contest_entity_id IS NOT NULL
        AND q_contest_entity_id = p_contest_entity_id
      )
    );
$$;

-- A participant row is a show appearance. The canonical SSC participation is
-- the edition + country/custom-entity identity shared by those appearances.
-- Repair historical rows first so semi/final copies cannot disagree on entry
-- details such as artist or song.
WITH canonical AS (
  SELECT
    p.id,
    (
      SELECT p2.artist
      FROM public.participants p2
      WHERE public.participant_same_edition_identity(
        p.edition_id, p.country_id, p.contest_entity_id,
        p2.edition_id, p2.country_id, p2.contest_entity_id
      )
        AND p2.artist IS NOT NULL
      ORDER BY p2.updated_at DESC, p2.created_at DESC, p2.id DESC
      LIMIT 1
    ) AS canonical_artist,
    (
      SELECT p2.song
      FROM public.participants p2
      WHERE public.participant_same_edition_identity(
        p.edition_id, p.country_id, p.contest_entity_id,
        p2.edition_id, p2.country_id, p2.contest_entity_id
      )
        AND p2.song IS NOT NULL
      ORDER BY p2.updated_at DESC, p2.created_at DESC, p2.id DESC
      LIMIT 1
    ) AS canonical_song
  FROM public.participants p
)
UPDATE public.participants p
SET
  artist = COALESCE(c.canonical_artist, p.artist),
  song = COALESCE(c.canonical_song, p.song)
FROM canonical c
WHERE p.id = c.id
  AND (
    p.artist IS DISTINCT FROM COALESCE(c.canonical_artist, p.artist)
    OR p.song IS DISTINCT FROM COALESCE(c.canonical_song, p.song)
  );

CREATE OR REPLACE FUNCTION public.sync_participant_entry_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist text;
  v_song text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- A newly supplied non-null value is authoritative. Null never erases a
  -- value already known for the same edition entry.
  v_artist := NEW.artist;
  v_song := NEW.song;

  IF v_artist IS NULL THEN
    SELECT p.artist
      INTO v_artist
    FROM public.participants p
    WHERE p.id <> NEW.id
      AND public.participant_same_edition_identity(
        NEW.edition_id, NEW.country_id, NEW.contest_entity_id,
        p.edition_id, p.country_id, p.contest_entity_id
      )
      AND p.artist IS NOT NULL
    ORDER BY p.updated_at DESC, p.created_at DESC, p.id DESC
    LIMIT 1;
  END IF;

  IF v_song IS NULL THEN
    SELECT p.song
      INTO v_song
    FROM public.participants p
    WHERE p.id <> NEW.id
      AND public.participant_same_edition_identity(
        NEW.edition_id, NEW.country_id, NEW.contest_entity_id,
        p.edition_id, p.country_id, p.contest_entity_id
      )
      AND p.song IS NOT NULL
    ORDER BY p.updated_at DESC, p.created_at DESC, p.id DESC
    LIMIT 1;
  END IF;

  UPDATE public.participants p
  SET
    artist = COALESCE(v_artist, p.artist),
    song = COALESCE(v_song, p.song)
  WHERE public.participant_same_edition_identity(
      NEW.edition_id, NEW.country_id, NEW.contest_entity_id,
      p.edition_id, p.country_id, p.contest_entity_id
    )
    AND (
      (v_artist IS NOT NULL AND p.artist IS DISTINCT FROM v_artist)
      OR (v_song IS NOT NULL AND p.song IS DISTINCT FROM v_song)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participants_sync_entry_details ON public.participants;
CREATE TRIGGER participants_sync_entry_details
AFTER INSERT OR UPDATE OF artist, song ON public.participants
FOR EACH ROW
EXECUTE FUNCTION public.sync_participant_entry_details();

-- One row in this view is one real edition participation. Multiple rows in
-- participants for semi/final appearances collapse to one canonical entry.
CREATE OR REPLACE VIEW public.edition_participations
WITH (security_invoker = true)
AS
WITH grouped AS (
  SELECT
    p.edition_id,
    CASE
      WHEN p.country_id IS NOT NULL THEN 'country:' || p.country_id::text
      ELSE 'entity:' || p.contest_entity_id::text
    END AS identity_key,
    max(p.country_id::text)::uuid AS country_id,
    max(p.contest_entity_id::text)::uuid AS contest_entity_id,
    (array_agg(p.artist ORDER BY (p.artist IS NOT NULL) DESC, p.updated_at DESC, p.created_at DESC) FILTER (WHERE p.artist IS NOT NULL))[1] AS artist,
    (array_agg(p.song ORDER BY (p.song IS NOT NULL) DESC, p.updated_at DESC, p.created_at DESC) FILTER (WHERE p.song IS NOT NULL))[1] AS song,
    bool_or(COALESCE(p.qualified, false)) AS qualified,
    count(*)::integer AS show_appearance_count,
    array_agg(p.show_id ORDER BY p.created_at, p.id) FILTER (WHERE p.show_id IS NOT NULL) AS show_ids,
    min(p.created_at) AS created_at,
    max(p.updated_at) AS updated_at
  FROM public.participants p
  GROUP BY p.edition_id,
    CASE
      WHEN p.country_id IS NOT NULL THEN 'country:' || p.country_id::text
      ELSE 'entity:' || p.contest_entity_id::text
    END
)
SELECT * FROM grouped;

GRANT SELECT ON public.edition_participations TO anon, authenticated;
REVOKE ALL ON FUNCTION public.participant_same_edition_identity(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.participant_same_edition_identity(uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_participant_entry_details() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
