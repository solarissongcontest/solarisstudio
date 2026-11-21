# SSC 22 Confirmation → Entry projection recovery (operator approval required)

**Status:** Prepared, NOT executed. This is not production migration authorization.
**Starting code SHA:** `110b260ee83cf639c3461055a418585539287684`.
**Scope:** SSC 22 only, bounded and audited. No bulk SQL UPDATE or historical backfill.

## Approval gates

1. Obtain an explicit, separate owner approval for (a) the forward migration and
   (b) the SSC 22 repair run. Neither is implied by PR approval, CI, or deployment.
2. Have the System/DB lane verify the currently hosted signature and effects of
   `public.submit_confirmation(jsonb)`, its grants, triggers, protected wrapper,
   entry-review and pending-winner migrations. The new migration explicitly fails
   closed if the old destructive sites or dependency contracts differ.
3. Verify the exact hosted migration frontier. Replay the forward-only migration
   *on both* (i) a disposable clean local Supabase and (ii) a sanitized
   hosted-equivalent **local** fixture. If either cannot be reproduced, STOP.
4. Obtain a consistent backup/PITR restore point and record the exact before
   projection values for the affected `public.entries` and `public.participants`
   rows. Record accepted current review versions and method history. A prior
   publicly published entry must not be changed by the repair.
5. Freeze incompatible Organizer decisions during the short bounded repair,
   or re-read current canonical versions immediately before every operation.

## Read-only diagnostic query template

Run **only with bounded edition scope** and an authorized operator session.
This query uses the real relationship `national_finals.submission_id ->
submissions.id -> submissions.edition_id`. A NULL direct
`national_finals.edition_id` is not evidence of no final.

```sql
with target_edition as (
  select id from public.editions where edition_number = 22 limit 1
),
latest as (
  select distinct on (lower(btrim(s.country))) s.*
  from public.submissions s
  join target_edition e on e.id = s.edition_id
  order by lower(btrim(s.country)), s.updated_at desc, s.id desc
)
select s.id as submission_id, s.country, s.selection_method,
       s.participating,
       ie.review_status as internal_review,
       nf.id as national_final_id,
       nf.winning_entry_id,
       nf.pending_winning_entry_id,
       nfe.review_status as winner_review,
       coalesce(nfe.removed, false) as winner_removed,
       official.id as official_entry_id,
       official.source as official_owner,
       official.status as official_status,
       official.updated_at as official_updated_at
from latest s
left join public.internal_entries ie on ie.submission_id = s.id
left join public.national_finals nf on nf.submission_id = s.id
left join public.national_final_entries nfe
  on nfe.id = nf.winning_entry_id
left join public.countries c on lower(btrim(c.name)) = lower(btrim(s.country))
left join public.entries official
  on official.edition_id = s.edition_id and official.country_id = c.id
where s.country in
  ('Abeven','Cychet','Ivara','Aotea','Eclipsion','Onyra','Witfordge','Udia')
order by s.country
limit 8;
```

Do not treat the historical November 21 country list as current drift evidence.
For an accepted NF winner the candidate must be nonremoved and exactly reviewed;
a `pending_winning_entry_id` is an Organizer review obligation, not an accepted
winner. Compare entry owner, lifecycle, version and publication before repair.

## Recovery run (only after approval)

1. Run the read-only `verifyConfirmationEditionProjectionInternal(editionId)`
   with the SSC 22 edition UUID. Save all discrepancies with type,
   submission ID and Entry ID, including `accepted_selection_pending_projection`.
2. Using the existing governed Organizer reconciliation endpoint, traverse only
   bounded pages (default 25, maximum 50), in order. Never invoke
   `syncConfirmationSubmissionToSolarisInternal` with a synthetic browser
   snapshot. Use the authoritative submission ID.
3. Review every outcome. Stop on `canonical_owned`, `canonical_newer`,
   unexpected publication changes, a conflicting reviewed version or an unknown
   source. Old submissions should be skipped as superseded.
4. Run the independent read-only verifier again. Require consistency for each
   explicitly approved Confirmation-owned row. If unrelated drift remains,
   classify and escalate it instead of treating a partial page as complete.
5. Re-run the diagnostic query to confirm the official statuses/artist/source
   match accepted currently active selections; verify public visibility rules
   independently and do not expose unreleased audio.
6. Record counts, exact release SHA, operator identity, before/after manifests,
   reconciliation receipts, and query budget. No automatic retries or scheduled
   production-wide sweeps.

## Recovery from an incorrect repair

Stop the reconciliation immediately. Quarantine the affected edition/source
and use the preflight snapshots plus approved PostgreSQL PITR / governed Entry
correction to restore affected official data. Do **not** run a blind reverse
UPDATE across SSC 22: another Organizer action might have committed in the
meantime. The preserved Confirmation review/version history remains canonical.
A forward migration is not rolled back by editing historical migration files.
Any compensating migration requires its own review and separate approval.

## Local-only verification

Use existing disposable Supabase rehearsal scripts with loopback-only DB_URL.
`v3-confirmation-maintenance-nf-winner-rehearsal.sh` verifies pending-winner
exact-version promotion. Add the new method-switch scenarios to a local fixture
before requesting production approval. Never run any of those scripts against
hosted Solaris Supabase.
