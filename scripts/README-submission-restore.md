# Confirmation submission restore deployment

Apply these scripts to the dedicated Confirmations Supabase project in this order after the matching Solaris Studio code is merged:

1. `confirmations-submission-version-restore.sql`
2. `confirmations-submission-version-restore-locking.sql`

The first script adds provenance columns, version-number constraints, the audited restore implementation and provenance-aware read output. The second script makes the public restore RPC acquire the same round-first lock used by ordinary confirmation edits, hides the inner mutation helper, and blocks restores that would bypass a later organizer moderation removal.

The restore operation is intentionally append-only: it captures the current submission state as a new `organizer_restore` version before applying the selected historical delegation-owned fields. Organizer review decisions are not restored; restored entries return to pending review.
