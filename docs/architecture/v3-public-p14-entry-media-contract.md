# Public V3 P14 — Entry media implementation contract

Status: **building / System integration pending**

Owner: Public / Participant / Fan V3 — Chat 2B

## Canonical product requirement

Public V3 P14 presents the participant-facing Entry media lifecycle without inventing browser truth:

1. `queued`
2. `uploading`
3. `processing`
4. `validating`
5. `accepted`
6. `failed`
7. `quarantined`
8. `replacement_required`

Upload completion and media acceptance are separate facts. A completed device transfer remains processing/validating until caller-scoped System authority says the exact current canonical source is accepted.

## Public ownership in this slice

Public owns the presentation projection and participant-facing status surface:

- `src/lib/v3-entry-media.ts`
- `src/components/v3/V3EntryMediaPipelineStatus.tsx`

The presentation layer may combine:

- mounted-client upload continuity; and
- participant-safe authoritative server evidence.

Server evidence wins whenever both exist.

The local upload state can establish only transfer/finalizer progress. In particular, a verified byte receipt maps to `validating`, never `accepted`.

## Current System handoff

The active canonical System Entry Media authority defines the backend boundary this Public layer is intended to consume. Its contract includes:

- exact authenticated Entry + asset-slot authorization;
- the supported initial slots `artist_photo` and `cover_artwork`;
- server-generated quarantine/final destinations;
- reuse of the existing verified-upload finalizer;
- same-logical-authorization retry/reconciliation;
- idempotent canonical commit after verified finalization;
- current-source optimistic concurrency;
- stale review supersession when the canonical source changes;
- caller-scoped `v3_my_entry_media` projection;
- participant-safe reasons and current-source fingerprints;
- no Organizer identity, upload secret, quarantine path, IP address or cross-delegation evidence.

The active client-side System adapter exposes `uploadVerifiedEntryMedia`, canonical commit handling and `loadMyEntryMediaProjection` around that authority.

Public must not duplicate that authority. Until the System stack is integrated into the actual base, this presentation foundation remains independently safe and does not call a fallback table/RPC or manufacture terminal state.

## Presentation projection contract

`V3EntryMediaServerProjection` deliberately mirrors only the participant-safe presentation evidence needed from System:

- stable asset key;
- `artist_photo` or `cover_artwork` asset type;
- participant-safe state;
- participant-safe reason;
- current-source fingerprint;
- authoritative update time.

The source fingerprint is evidence that terminal review state belongs to the current source. Public does not calculate it and does not use mutable file labels as identity.

## Existing upload continuity reused

`src/lib/v3-media-upload-continuity.ts` already preserves safe mounted-client recovery semantics:

- prepared authorization → queued;
- active transfer → uploading;
- completed or ambiguous transfer/finalization → processing;
- verified bytes → validating;
- retryable/terminal upload failure → failed.

Ambiguous transport does not justify a second authorization. The same authorization is reconciled until the server proves it terminal.

Public does not add a second upload store, review table, direct Storage-path writer or browser acceptance ledger.

## Honest progress requirement

Percentage progress is shown only when the caller supplies measured byte progress.

Without trustworthy measured bytes, the UI uses an indeterminate `Uploading…` state. It must not animate fictional percentages or infer progress from elapsed browser time.

## Accessibility

The reusable status surface:

- exposes the exact state in semantic text;
- uses `aria-live` for changing status;
- uses an actual `progressbar` only when measured progress exists;
- provides a normal button for safe retry when retry is actually available;
- does not require drag, gesture or animation to recover.

## Deliberate initial media boundary

The current System authority supports the image slots `artist_photo` and `cover_artwork` because those formats fit the existing authoritative verification profile.

Audio/video must remain unavailable until System has an equivalent byte-verification and canonical-source contract. Public must not widen accepted media types merely to make the screen appear complete.

## Integration sequence after System authority lands

1. Consume the canonical participant Entry Media adapter rather than calling private tables.
2. Load the exact caller-owned Entry projection.
3. Map each authoritative asset into `V3EntryMediaServerProjection`.
4. Preserve local continuity only for the mounted transfer/finalization phase.
5. Let server evidence override local continuity once available.
6. Wire upload/replacement controls into the canonical Entry participant surface without creating a second Entry authority.
7. Reconcile an uncertain outcome by the same operation/authorization instead of blind resubmission.
8. Keep unsupported asset classes explicitly unavailable.

This integration must coordinate with the active Entry screen owner rather than editing the same route concurrently.

## Acceptance scenarios

### P14-A — normal upload

1. Participant selects a supported Entry image.
2. System authorizes the exact Entry + asset slot.
3. UI shows `queued`, then `uploading`.
4. Device transfer completes; UI shows `processing`.
5. Finalizer verifies the exact bytes; UI shows `validating`, not accepted.
6. Canonical participant projection reports `accepted` for the current source.
7. UI now shows accepted.

### P14-B — lost upload/finalizer response

1. A response is lost after bytes may have reached quarantine or after finalization may have committed.
2. Client keeps the same logical authorization.
3. Existing reconciliation/finalizer authority determines the result.
4. No duplicate logical asset is created solely because transport was ambiguous.

### P14-C — replacement required

1. Current-source review requires replacement.
2. Participant projection reports `replacement_required` with safe actionable copy.
3. Entry correction focuses the Media work.
4. Replacement changes canonical source identity/fingerprint.
5. Old acceptance/rejection evidence no longer applies to the replacement.

### P14-D — quarantine

1. Finalizer or integrity policy quarantines the media.
2. Participant projection reports `quarantined` without internal security/moderation details.
3. Public never presents it as accepted or publishable.

### P14-E — stale multi-device source

1. Device A receives authorization against current source/version A.
2. Device B changes the same asset slot to source/version B.
3. Device A later tries to commit its verified token.
4. System rejects the stale source transition.
5. Public reloads/reconciles and keeps B as current truth.

## Release gate

P14 remains **building**, not parity, until all of the following are true:

- the canonical System Entry Media authority is merged/deployed in the supported runtime;
- Public consumes that authority without fallback to broader private data;
- the Entry participant surface exposes upload, current state and replacement recovery coherently;
- safe retry/reconciliation is exercised end to end;
- stale replacement/source evidence is proven unable to reappear as current acceptance;
- authenticated normal, ambiguous, replacement, quarantine and multi-device scenarios have objective evidence;
- focused accessibility states are verified;
- exact-head Quality and Browser Audit pass;
- automated verification remains isolated/local and never falls back to hosted production Supabase.
