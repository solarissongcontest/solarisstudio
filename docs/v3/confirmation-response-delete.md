# Governed Confirmation response deletion

Migration 543 replaces `admin_confirmation_delete_response(uuid)` with the same
command family's revision/operation contract. The existing STABLE response read
returns an opaque revision from the response, selection content and review
counter in the same snapshot as the displayed data. Deletion takes the existing
round/content locks and checks that revision before changing canonical state.

The command requires a live session and the existing canonical delegation.manage
authority. Its S2 fingerprint binds the response and expected revision. Claim and
exact readback happen before looking for the response, so a committed deletion
can be recovered after the row disappears. Changed requests conflict. The audit,
receipt, response/selection cascade and requirement reconciliation commit or roll
back together. Archived editions remain protected; canonical Solaris Entry state
keeps its separate authority. Audit evidence retains identifiers and the revision,
without copying response secrets or personal content into a deletion snapshot.

Transport roles cannot execute deletion, call S2 mutation primitives, or forge,
rewrite or delete this command's receipt rows. The invoker receipt guard also
protects recovery history against raw truncation. Other command families retain
their existing row behavior and legitimate read grants.

The sole caller retains the approved operation in account-scoped session storage.
Reload recovery runs before the response lookup and reuses the original request.
Only an explicit canonical VERSION_CONFLICT clears it for a new reviewed attempt.

The existing Confirmation runtime-state SQL fixture covers authorized deletion,
selection-change CAS, row-absent exact retry/readback, changed revision/target,
revocation, missing capability, receipt forgery, duplicate suppression and injected
audit/receipt failures. Focused caller tests cover uncertain outcomes, reload,
account isolation and fresh review after a definitive stale rejection.
