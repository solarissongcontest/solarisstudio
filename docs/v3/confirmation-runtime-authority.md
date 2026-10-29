Confirmation runtime authority
================================

The retained round-version and requirement triggers are internal mechanisms.
Round versions advance only from canonical round/response writes. Requirement
fulfillment derives from the canonical response, including deletion, and cannot
select a new reconfirmation generation. Initial requirement materialization is
owner-only implementation behind the reviewed materialization command.

Bounded requirement repair now uses the existing command name with required
`operation_id` and `idempotency_key` arguments. It requires an active session and
current edition-scoped `delegation.manage`; service-role possession supplies no
authority. The old three-argument endpoint is private owner-only implementation.
Repair takes the same edition lock as materialization, waiver and reconfirmation,
uses current canonical inputs, preserves the existing 50/500 bounds, and refuses
to invent a missing canonical generation. The caller supplies no replacement
status or authoritative generation/version. Reconfirmation remains a separate
reviewed CAS command.

The command atomically commits repair, synchronous canonical task reconciliation,
observed state hashes, audit and a durable S2 receipt. A lost-response retry uses
that same operation identity before inspecting current mutable state. Its receipt
proves the past operation; it does not replace a new verification of current
truth. Changed requests are rejected. Unchanged reconciliation no longer writes
`updated_at`, preserving opaque reviewed requirement revisions.

The executable mechanism proof checks exact bodies, search paths, ACLs, caller
chains, protected inputs and trigger definitions. SQL regression covers stable
no-op revisions, repair, exact retry, semantic mismatch, missing-generation
denial, response deletion and bounded CAS advancement, revoked session and
capability, service-role denial, and audit/receipt rollback. Structural unit
snapshots are test fixtures, not exact-SHA release evidence.
