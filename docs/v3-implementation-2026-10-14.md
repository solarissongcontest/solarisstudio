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
