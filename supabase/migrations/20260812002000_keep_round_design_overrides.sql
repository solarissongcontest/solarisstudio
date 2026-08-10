-- ============================================================
-- KEEP ROUND-SPECIFIC DESIGN OVERRIDES
--
-- The edition design is the default.
-- Individual shows/rounds may then have a small visual override.
--
-- The old participant-change trigger re-copied the edition design
-- into a show whenever participants changed, which would erase a
-- round-specific override. Column count is now calculated in the app
-- when a design is saved, so that trigger is no longer needed.
-- ============================================================

drop trigger if exists
refresh_show_design_for_participant_change_trigger
on public.participants;

-- Keep the function in place for backwards compatibility.
-- Nothing calls it after the trigger is removed.

-- Existing edition -> show synchronisation remains intact.
-- Saving the edition default intentionally applies that default to
-- every round again. After that, individual round overrides may be
-- saved separately and will no longer be erased by participant edits.
