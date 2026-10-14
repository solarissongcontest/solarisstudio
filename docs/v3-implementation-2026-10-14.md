# V3 implementation — 14 October 2026

The operator reported applying the prior Results migration and Media finalizer
update. That report is not an independent production inspection.

## Exact-ballot Televote recovery

The existing server-created preflight token binds recovery to the original
round, normalized identity, home country and complete ballot. The new STABLE
`public.v3_reconcile_televote` RPC additionally compares committed vote entries
and returns only a matching, non-deleted submission's receipt metadata. A
committed receipt remains readable after round closure or preflight expiry.
Network/device duplicate errors cannot establish acceptance for another token.
The original checked mutator retains all deadline, integrity, sanction and
duplicate checks; no new ballot can bypass them through reconciliation.

The server reads before retrying and reconciles ambiguous SQL responses. The
browser additionally reconciles a lost server-function HTTP response. Successful
legacy acknowledgments remain valid if the additive RPC is not deployed yet;
failed receipt reads do not invent a timestamp or convert an error into success.
Local stored markers now show an advisory remembered-vote notice, not a confirmed
receipt. No bearer token is persisted by this change. Reload and cross-device
recovery of an anonymous pending operation remain separate work.

Apply `20261014010000_v3_televote_receipt_reconciliation.sql` in migration order
and deploy the matching application/server bundle. No existing applied migration
or feature-flag value is rewritten. Production verification must follow the
existing protected operational-mode workflow; automated rehearsals stay local.

## Identity-first Me root

The installed-app `/my-solaris` root is separately gated by disabled-by-default
`solaris_app_v3_me`. Explicit legacy tabs, nested routes and Organizer country
inspection contexts retain their established behavior. The V3 root composes the
existing MySolaris account provider, profile and following queries. The provider
accepts the server's canonical edition context for V3 without changing the
legacy workspace's edition selection.

The new authenticated STABLE summary RPC derives active delegation access inside
the database and counts only V3 Confirmation receipts matching an allowed
submission and its exact round. Browser summaries are bound to both viewer and
country; unavailable data stays unknown. History describes recorded delegation
confirmations, not personal membership or who submitted them. Current membership
requires a confirmed canonical entry and active delegation access. Organizer
navigation uses the existing authoritative access engine.

Apply `20261014020000_v3_me_cutover.sql` after the Televote migration, then deploy
the matching application bundle. Keep the Me flag disabled until the intended
rollout cohort is selected. Other workflow receipt histories, anonymous recovery
across reload/devices, Entry version binding, Jury, Organizer and Live cutovers
still need separate implementation and certification.

The normal Televote submit button also retains the attempted round, identity,
preflight token and exact point allocation for an unchanged in-memory retry.
It starts a fresh preflight only when those inputs no longer match. Point editing
and review navigation are locked while checks, attestation or submission are in
flight. These client safeguards do not establish acceptance; server reconciliation
and the original checked mutator remain authoritative.

## Entry content versions and exact review binding

Confirmation internal entries and submission-linked National Final candidates
now append private, immutable content snapshots on creation and material edits.
The snapshot covers artist, song, song URL, preview/final clip boundaries and
replacement video requirements/URL. Running order, result position and
next-in-line selection remain separate operations. Revisions are contiguous for
a canonical entry identity; restoring old content through the existing editor
creates another revision and requires another review. A replacement canonical
row starts a new entry identity, while the old evidence is retained privately.
Versioned entry/parent identities cannot be moved to another Confirmation or
edition to reuse old review evidence.

The existing capability-checked, idempotent review operation remains the writer.
It locks the entry before checking the submission review revision, refreshes its
context after locking, and records exact version identity in review history.
The Organizer also compares its displayed version with the fresh preview: an
unseen replacement version requires a refresh before approval. Content changes
reset approval/rejection to pending; removed NF candidates remain removed.
Selecting a submission-linked NF winner requires an exact current-version
review. Restoring a historical NF snapshot leaves the winner unset and all
restored content pending; even an identical-content restore creates a new
version identity. The original restore wrapper keeps its moderation-removal
checks and durable submission-level restore provenance. Clear the winner before
editing its content. A concurrent conflicting operation can fail with PostgreSQL's
serialization/deadlock protection; refresh and preview again rather than retrying
a stale command.

Apply `20261014030000_v3_entry_review_binding.sql` and deploy the matching app.
Existing decisions and winners are preserved, but their initial snapshots are
marked `legacy_observation` and are **not** retroactively certified. Re-review
an older accepted candidate before selecting it as a new winner. Country and
Organizer review panels distinguish this evidence from a review of the current
version. Historical national finals without a Confirmation submission keep
their existing workflow. A private history RPC grants active owning delegations
or edition-scoped reviewers read access, with no direct ledger grants.

Clean and upgrade rehearsals exercise the real review RPC, stale preview
rejection, immutable content/reviews, pointer spoofing, restoring old content,
country/anonymous isolation, read-only history, and winner protection. The
upgrade job seeds an accepted entry on main before applying the migration and
checks that no exact-version review was fabricated. This completes the Entry
server binding increment; the dedicated V3 Entry screen, participant-side
submission/receipt experience and broader rollout certification remain
outstanding.

Bound public review-history rows cannot be updated, rebound or directly deleted,
and browser inserts must go through the canonical review operation. Response
cascade deletion remains possible while the separate private evidence is
retained. INSERT evidence is recorded after the canonical row exists so an
UPSERT conflict cannot create a phantom version for its discarded insert row.
Authority rehearsals also exercise these paths and the real historical NF
restore wrapper, including a repeated same-content restore.

The review and winner-select RPCs now require the displayed content version in
addition to the shared review revision. Their defaulted eighth parameter keeps
legacy RPC lookup resolvable, but missing/stale version identity fails closed.
The app sends it only when the server exposes version metadata, so deploying
the app first still supports the older database. After migration, older cached
clients must reload the updated app before reviewing; winner clear remains
available without a content-version argument. Restoration now uses a private,
case/whitespace-normalized matcher for candidate identity; the old canonical
restore wrapper referenced a missing public helper. Positive NF restoration and
rejection of later moderation removals are exercised through that real wrapper.

## Immutable Entry restore provenance

`20261014040000_v3_entry_restore_provenance.sql` makes Organizer restoration an
explicit Entry-version event instead of leaving it indistinguishable from an
ordinary participant/canonical content write. Each Entry version created by the
already-authorized historical Confirmation restore now has source
`organizer_restore` and stores the exact immutable `submission_versions.id` that
was selected as the restore source. Ordinary writes remain `canonical_write`;
legacy backfill remains `legacy_observation`. A database constraint requires the
restore source and provenance UUID to appear together.

The restore wrapper still owns authorization, round-first locking, moderation
removal protection and the original mutation helper. Immediately around that
helper it establishes a transaction-local provenance marker. Entry triggers
validate that the marked historical version belongs to the same canonical
submission before recording it, so a different Confirmation cannot be cited as
the source. The marker is restored after the operation and cannot grant review
or winner authority. Restored content remains pending and exact-version review
is still required.

The authorized `v3_confirmation_entry_versions` read model now exposes
`restored_from_submission_version_id` with each immutable version. The private
ledger deliberately does not foreign-key that UUID back to the public historical
row: canonical response deletion may cascade through public submission history,
but must not erase already-recorded audit evidence. Clean and upgrade migration
rehearsals execute the real guarded restore twice, assert fresh provenance-bound
versions, reject inconsistent source/provenance rows through the schema
constraint, and verify the evidence survives deletion of the disposable
canonical response. All rehearsals refuse hosted Supabase and run only against
the isolated local stack.

This closes the explicit restore-provenance backend gap. The dedicated V3 Entry
participant presentation, participant draft/submission and receipt UX, and full
Entry rollout certification are the remaining Entry-facing slices.
