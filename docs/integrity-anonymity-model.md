# Trust & Integrity privacy and identity model

This document defines the privacy invariants for Solaris Studio Trust & Integrity cases. These are security requirements, not presentation preferences.

Solaris supports three identity modes with deliberately different guarantees:

1. **Fully Anonymous**: no Solaris reporter account ID is attached to the case.
2. **Sealed Identity**: the reporter account is attached for recovery and notifications, but ordinary case reviewers cannot reveal it. Exceptional disclosure requires the two-organizer break-glass process described below.
3. **Confidential**: the reporter account is attached for recovery and authorised organisers may explicitly retrieve the identity when necessary; each identity access is recorded in the case audit trail.

None of these modes claim network-level anonymity from hosting, CDN, database or other infrastructure providers.

## Fully Anonymous

A fully anonymous integrity case must not be linked to the reporter's Solaris account in the application case data.

The case record therefore has no reporter user ID, and the database enforces that rule with the `fully_anonymous_has_no_reporter_identity` constraint. Creation, case retrieval, replies and anonymous appeals use a dedicated sessionless Supabase client so the signed-in browser session is not forwarded into the anonymous case workflow.

A reporter receives two credentials:

- a public case code, used as a human-friendly case reference;
- a high-entropy recovery key, used as the secret required to reopen the anonymous mailbox.

Only a SHA-256 digest of the normalized recovery key is stored by the case-access table. The raw recovery key is returned once to the reporter and may optionally be kept in that browser's local storage for convenience.

If the recovery key is lost, TSBC cannot reconstruct it from the digest. Adding account-based recovery to Fully Anonymous reports would contradict this identity model.

## Sealed Identity

A sealed case intentionally **does** contain the reporter's Solaris account ID. That link is required for account-based recovery, protected messaging, evidence access and notifications. Sealed therefore does not mean that the database has no identity; it means the identity is withheld from ordinary case-review access.

The normal organiser identity RPC explicitly refuses sealed cases. An investigator cannot reveal a sealed reporter merely by opening the case or pressing the ordinary confidential-identity action.

### Exceptional break-glass disclosure

A sealed identity can be disclosed only through a separate two-person break-glass workflow:

1. An organiser creates a disclosure request for a specific sealed case and records an exceptional reason.
2. A **different** organiser must approve or reject the request. The requesting organiser cannot approve their own request.
3. Approval lasts for 30 minutes.
4. Only the organiser who originally requested disclosure may use that approval.
5. The approval can reveal the identity once. The request then moves to `used` and cannot be reused.
6. If the approval expires unused, it cannot reveal the identity and is moved out of the active approval state before another request is created.
7. An actual sealed-identity reveal creates a **reporter-visible** case event. The reporter can therefore see that break-glass disclosure occurred.

The revealed email/user ID is returned to the requesting organiser for that action. Solaris does not copy it into a general case field merely for convenience.

This process is intended for exceptional circumstances, not ordinary investigation curiosity. The technical requirement for two organisers is a control against one-person discretionary disclosure; it does not itself define which real-world emergencies justify disclosure.

## Confidential Identity

A confidential case also contains the reporter's Solaris account ID. Authorised organisers may explicitly request the reporter identity when it is necessary to handle the case.

The identity is not included by default in the normal case snapshot. Access occurs through a dedicated organiser-only RPC and creates an internal `identity.accessed` case event.

Confidential is therefore less restrictive than Sealed Identity. Reporters choosing Confidential should understand that an authorised organiser may identify them without the two-person sealed break-glass process.

## What the identity modes do not promise

The application privacy model controls what Solaris Studio stores in Trust & Integrity case records and how application users may access it. It does not claim that normal infrastructure providers have no ordinary security or network logs. Hosting, CDN, database or platform infrastructure may maintain logs according to deployment configuration and retention policies.

The UI must not describe any mode as providing IP anonymity, network anonymity or an impossibility of identification unless the deployment architecture has been independently designed and verified to provide those properties.

Report content itself can also identify a reporter. The system cannot anonymise a message such as “I am the only person who received this DM at 14:03.” Uploaded files can similarly contain identifying information.

## Core identity invariants

1. `identity_mode = 'anonymous'` implies `reporter_user_id IS NULL` at the database level.
2. `identity_mode IN ('sealed', 'confidential')` requires a reporter account ID.
3. Anonymous create/read/reply/appeal functions must not forward the user's normal Solaris authentication session into the anonymous workflow.
4. Direct `anon` and `authenticated` table access to integrity case data remains revoked. Public interaction occurs through narrow RPCs.
5. Anonymous recovery keys are never stored in plaintext server-side.
6. The organiser case workspace never receives a recovery-secret hash.
7. The organiser case workspace never receives an account identity for Fully Anonymous cases because no such case identity exists.
8. Ordinary organiser identity access must continue refusing Sealed Identity cases.
9. Sealed break-glass approval requires two different organisers and expires after 30 minutes.
10. An actual sealed identity disclosure creates a reporter-visible audit event.
11. Confidential identity access is explicit and audited rather than silently included in every organiser case response.
12. Internal investigator notes are stored separately from reporter-visible messages.
13. A report, automated signal or open investigation is not represented as a finding of misconduct.

## Evidence Vault

Evidence uploads are implemented through the private `integrity-evidence` storage bucket. The bucket is not public.

Current upload controls include:

- maximum file size of 15 MB;
- allowlisted MIME types: PNG, JPEG, WebP, PDF and plain text;
- short-lived upload tokens tied to a specific case and object path;
- random path components rather than human-guessable public URLs;
- reporter images are re-encoded in the browser before upload to remove ordinary image metadata;
- the UI warns that PDFs and text documents may still contain identifying information inside the document itself.

Image re-encoding is not malware scanning. The current implementation must not claim that arbitrary uploaded files have been malware-scanned unless such scanning is added and verified separately.

### Evidence visibility

Case ownership alone does **not** authorise a protected reporter to read every file attached to the case.

The storage read check requires that the evidence record:

- belongs to the reporter's case;
- matches the exact storage path;
- is explicitly `visible_to_reporter = true`;
- remains in the active lifecycle state.

This prevents a reporter from reading TSBC-only evidence merely because it was attached to the same case.

Fully Anonymous reporters can upload evidence through recovery-key-authorised upload RPCs, but are not granted generic authenticated storage-read access.

### Evidence access logging

Protected reporter and organiser file retrieval uses a narrow access-descriptor RPC. The request is logged before the client creates a short-lived signed URL. Current signed download URLs expire after 60 seconds.

Direct client access to the evidence-access log table is revoked.

### Retention and deletion

Evidence has an explicit lifecycle:

`active` → `scheduled_for_deletion` → `deleted`

Case-level retention can be propagated to active evidence. Organisers may schedule a specific evidence item for deletion with a reason, and may cancel a scheduled deletion with another recorded reason.

Deletion is deliberately two-step:

1. remove the private storage object;
2. only after the retention date has passed and the object is confirmed absent, mark the evidence record deleted.

The database refuses to mark evidence deleted while the private storage object still exists. The evidence database record remains as lifecycle/audit metadata rather than pretending the history never existed.

Expired unfinished upload tokens are also surfaced for controlled cleanup. If an orphaned private object exists, it must be deleted before the expired token can be discarded.

## Evidence disclosure and redaction

The evidence model distinguishes original records from `redacted_from_id` and `disclosure_copy_of_id` relationships. Reporter-visible disclosure should use purpose-built redacted/disclosure copies where necessary to protect another source, private data or security-sensitive material.

A participant's right to understand an allegation does not automatically create a right to receive every original file or the identity of a protected source.

## Appeals and identity privacy

Reporter-visible sanctions can be appealed without weakening the chosen identity mode:

- protected Sealed/Confidential reporters appeal through their account-owned case;
- Fully Anonymous reporters appeal using the case code and recovery key;
- the ordinary appeal deadline is 48 hours;
- exceptional deadline extensions require an audited organiser action;
- an appeal receives a fresh reviewer who cannot be the original finding author or sanction decision-maker where the enforced workflow applies.

An appeal does not convert a Fully Anonymous case into an account-linked case and does not automatically unseal a Sealed Identity case.

## Organizer review principles

Case review must preserve the distinction between:

- report or signal received;
- allegation being reviewed;
- evidence;
- formal finding;
- sanction decision;
- appeal outcome.

Closing a case for insufficient evidence is not the same finding as determining that no violation occurred.

Automated voting-integrity signals may identify cases for human review but do not independently establish guilt or justify sanctions.

## Tests protecting these assumptions

The repository contains contract tests for:

- anonymous-case database identity constraints and direct-table restrictions;
- recovery-secret hashing and sessionless anonymous functions;
- separation of internal notes from reporter-visible messages;
- Sealed/Confidential identity boundaries;
- two-organiser sealed identity break-glass approval, expiry and one-use disclosure;
- reporter-visible audit of actual sealed disclosure;
- private evidence storage, explicit reporter visibility, signed short-lived access and access logs;
- evidence retention, two-step deletion and expired-upload cleanup;
- sanctions, 48-hour appeals and fresh-review requirements;
- Rules + Integrity migration ordering.

These tests should be updated deliberately if the privacy model changes, not deleted merely to make a refactor pass.
