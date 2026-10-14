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
