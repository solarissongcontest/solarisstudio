# Public V3 P14 — Entry media implementation contract

Status: **building / System contract blocked**

Owner: Public / Participant / Fan V3 (Chat 2)

## Canonical product requirement

Public V3 P14 requires the Entry media pipeline to present these user-facing states without inventing browser truth:

1. `queued`
2. `uploading`
3. `processing`
4. `validating`
5. `accepted`
6. `failed`
7. `quarantined`
8. `replacement_required`

Upload completion and media acceptance are separate events. A completed device transfer must be shown as processing/validating until server authority says the current canonical source is accepted.

## Existing reusable System authority

The repository already has a strong verified-upload continuity foundation:

- `studio2_prepare_upload(...)` authorizes an exact short-lived quarantine destination.
- storage writes use `upsert: false`.
- `solaris-upload-finalize` verifies/finalizes the same authorization.
- `v3-media-upload-continuity.ts` preserves the same authorization across ambiguous transport/finalizer responses.
- a fresh authorization is not minted merely because a response was lost.
- `studio2_media_asset_reviews` stores Organizer review evidence without becoming a second asset/upload store.
- S3 media invariants supersede stale review evidence when the canonical media source changes.

Public P14 reuses these contracts. It does not add a second upload store, review table or client-side acceptance ledger.

## Current blockers found by the P14 audit

### 1. Entry media is not an authorized unified-upload domain

`src/lib/upload-safety.ts` currently exposes the unified domains:

- `country_media`
- `edition_artwork`
- `country_font`
- `beta_feedback`

There is no caller-authorized Entry media domain yet. Public must not emulate one with direct Storage paths, caller-selected buckets, unrestricted `upsert`, or metadata-only URLs presented as completed uploads.

### 2. Organizer review evidence is not a participant projection

`public.studio2_media_asset_reviews(uuid)` is guarded by `private.studio2_can_manage_media_assets(...)` and therefore intentionally requires Organizer / `entry.approve` authority.

Public must **not** call that RPC and hide authorization errors, copy review rows into browser persistence, or infer review state from Organizer Task data.

### 3. The required participant-safe read projection is missing

System V3 needs a caller-scoped participant media projection that can disclose only the submitting delegation's current Entry media state.

The exact function name remains System-owned, but its semantic contract must provide enough evidence to render, for each current Entry asset:

- stable asset key and asset type;
- current canonical-source identity/fingerprint or equivalent binding;
- one participant-safe pipeline state: `processing`, `validating`, `accepted`, `failed`, `quarantined`, or `replacement_required`;
- safe participant-facing reason/details when action is required;
- authoritative update time;
- replacement requirements when the current source is rejected;
- no raw authorization secret, storage capability, IP address, internal moderation identity, or cross-delegation evidence.

It must derive acceptance only from evidence matching the **current** canonical source. Superseded approvals must never survive source replacement.

## Required System write authority for Entry media

System should extend the existing verified upload pipeline rather than create a new browser-owned writer.

The Entry media authorization must:

- bind the authenticated actor to a delegation they may submit for;
- bind the authorization to one canonical Entry and one supported asset slot;
- generate the quarantine/final destination server-side;
- keep the same logical authorization through retry/reconciliation;
- finalize idempotently;
- expose no service-role capability to the client;
- make a changed canonical source supersede stale review evidence;
- preserve the existing S3/S5 review/consequence invariants.

Public must not choose another user's profile/delegation id as authority.

## Public implementation completed in this branch

`src/lib/v3-entry-media.ts` projects existing local upload continuity into the P14 vocabulary:

| Existing continuity | Public P14 state |
| --- | --- |
| prepared | queued |
| uploading | uploading |
| ready_to_finalize / quarantine_uncertain / finalizing / finalize_uncertain | processing |
| verified | validating |
| retry_upload / rejected / expired | failed |

The mapping intentionally **does not** produce `accepted`, `quarantined`, or `replacement_required` from local upload continuity. Those states require the participant-safe server projection.

If System evidence exists, it wins over local continuity.

## Honest progress requirement

The current Supabase Storage upload path does not expose a trustworthy byte-progress callback through the existing wrapper. Public therefore must not animate a fictional 0–100% bar.

`actualUploadProgressPercent(...)` accepts measured bytes only. Without measured progress the UI must show an indeterminate `Uploading…` state, then separately `Processing…` after transmission.

## Resumability boundary

Current `uploadVerifiedFile(...)` safely reuses the same authorization for retries while the original `File` object and client remain mounted. Its weak-map continuity deliberately does **not** claim page-reload recovery because upload secrets are not persisted in browser storage.

P14 may describe this as safe retry, not durable cross-reload resume. Durable resume would require an additional System-owned capability and threat-model review.

## Acceptance scenarios

### P14-A — normal upload

1. User selects a supported Entry media file.
2. Server authorizes one exact Entry/asset slot.
3. UI shows `queued`, then `uploading`.
4. Device transfer completes; UI shows `processing`.
5. Finalizer verifies the exact bytes; UI shows `validating`, **not accepted**.
6. Participant projection later reports `accepted` for the current source.
7. UI may now show accepted.

### P14-B — lost upload response

1. Upload response is lost after bytes may have reached quarantine.
2. Client keeps the same authorization.
3. Finalizer reconciles that authorization.
4. No duplicate logical asset or second authorization is created solely because transport was ambiguous.

### P14-C — replacement required

1. Organizer/System review rejects the current source.
2. Participant-safe projection reports `replacement_required` with a safe actionable reason.
3. Entry correction flow focuses the Media section.
4. Replacement changes canonical source identity.
5. Old acceptance/rejection evidence does not apply to the new source.

### P14-D — quarantine

1. Finalizer or integrity policy quarantines the media.
2. Participant projection reports `quarantined` without exposing internal moderation/security details.
3. Public does not present the asset as accepted or publishable.

## Release gate

P14 remains **building**, not parity, until all of the following are true:

- System exposes the caller-scoped Entry media upload authority;
- System exposes the participant-safe current media projection;
- Public Entry Media section is wired to those contracts;
- safe retry/reconciliation is exercised end-to-end;
- replacement invalidates stale acceptance;
- exact-head Quality and Browser Audit pass;
- authenticated acceptance evidence covers normal, ambiguous, replacement and quarantine flows.
