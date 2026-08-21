-- Confirmations security follow-up.
-- These functions are database trigger helpers only. PostgreSQL grants EXECUTE
-- to PUBLIC on newly created functions unless explicitly revoked, which made
-- them appear as callable RPCs even though the application never needs that.

revoke all on function public.keep_submission_editable_after_open_edit() from public, anon, authenticated;
revoke all on function public.sync_submission_editing_from_edition() from public, anon, authenticated;
revoke all on function public.sync_submission_editing_from_round() from public, anon, authenticated;
