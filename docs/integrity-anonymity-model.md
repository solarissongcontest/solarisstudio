# Trust & Integrity anonymity model

This document defines the privacy invariants for Solaris Studio's fully anonymous Trust & Integrity cases. These are security requirements, not presentation preferences.

## What “fully anonymous” means in Solaris Studio

A fully anonymous integrity case must not be linked to the reporter's Solaris account in the application case data.

The case record therefore has no reporter user ID, and the database enforces that rule with a constraint. Creation, case retrieval and reporter replies use a dedicated sessionless Supabase client so the signed-in browser session is not forwarded into the anonymous case workflow.

A reporter receives two credentials:

- a public case code, used as a human-friendly case reference;
- a high-entropy recovery key, used as the secret required to reopen the anonymous mailbox.

Only a SHA-256 digest of the normalized recovery key is stored by the case-access table. The raw recovery key is returned once to the reporter and may optionally be kept in that browser's local storage for convenience.

## What “fully anonymous” does not promise

This application-level design prevents Trust & Integrity case records from identifying the reporter through their Solaris account. It does not claim that normal infrastructure providers have no ordinary security or network logs. Hosting, CDN, database or platform infrastructure may maintain logs according to their own configuration and retention policies.

The user interface must not describe the system as providing network-level anonymity, IP anonymity or an impossibility of identification unless the deployment architecture has been independently designed and verified to provide those properties.

Reporters should also be warned that information they type into the report can identify them. The system cannot anonymize a message such as “I am the only person who received this DM at 14:03”.

## Required invariants

1. `identity_mode = 'anonymous'` implies `reporter_user_id IS NULL` at the database level.
2. Anonymous create/read/reply server functions must not call `getSession`, `getUser` or forward an access token from the user's Solaris session.
3. Direct `anon` and `authenticated` table access to integrity case data remains revoked. Public interaction occurs through narrow RPCs.
4. Recovery keys are never stored in plaintext server-side.
5. The organizer case workspace never receives the recovery-secret hash.
6. The organizer case workspace never receives a reporter account ID for anonymous cases.
7. Internal investigator notes are stored separately from reporter-visible messages.
8. Reporter-visible disclosure may be redacted when necessary to protect another source, private data or security details.
9. A report, automated flag or investigation is not represented as a finding of misconduct.
10. Any future attachment feature must protect reporter privacy before it is enabled, including metadata handling, storage access controls and disclosure/redaction rules.

## Recovery credential design

The current recovery key is generated from 12 cryptographically random bytes and represented as uppercase hexadecimal groups for easier copying. The case code is not treated as a secret. Access requires both the case code and the recovery key.

The raw recovery key should never be written to logs, analytics events, organizer interfaces, support diagnostics or error reports.

If a reporter loses the recovery key, TSBC cannot recover it from the stored digest. This is intentional. Adding an account-based recovery mechanism to fully anonymous reports would contradict the identity model.

## Organizer access

Organizer-only RPCs check the existing `organizer` role before returning or changing case data. Anonymous identity data is absent rather than merely hidden in the UI.

Case review should preserve the distinction between:

- a report received;
- an allegation or signal being reviewed;
- a formal investigation;
- a factual finding;
- a sanction decision.

Closing a case for insufficient evidence is not the same finding as determining that no violation occurred.

## Attachments

Attachments are intentionally not part of the first implementation. A secure attachment design must address at least:

- private object storage with no guessable public URL;
- file size and type restrictions;
- malware scanning where available;
- image/document metadata stripping or explicit reporter warnings;
- immutable original evidence versus redacted disclosure copies;
- access logging for organisers;
- deletion and retention rules;
- protection against an attachment exposing an anonymous reporter's identity;
- no automatic loading of remote content embedded in uploaded documents.

Do not add a generic public upload bucket and call it evidence handling. That would be technologically impressive in the same way leaving the front door open is a key-management strategy.

## Tests protecting these assumptions

The repository contains contract tests for:

- anonymous-case database identity constraints and table-access restrictions;
- recovery-secret hashing;
- separation of internal notes from reporter-visible messages;
- pgcrypto migration ordering;
- the sessionless server-function boundary.

These tests should be updated deliberately if the privacy model changes, not deleted merely to make a refactor pass.
