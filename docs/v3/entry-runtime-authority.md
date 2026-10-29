Entry runtime authority
=======================

`studio2_apply_participation_status` remains the sole external command for its
Entry status transition. It requires an active session and current scoped
`entry.approve`, binds the complete request to its existing stable operation
identity, serializes Entry rows before participant mirrors and the CAS row,
rejects stale state and archived mutation, and commits state, audit, durable
`participation.changed` observation and receipt atomically. Exact replay reads
the receipt before current lifecycle/CAS checks, after fresh actor checks. The
old four-argument persistence primitive has no API-role execution privilege.

The other five mechanisms cannot independently choose Entry content or approve
it. YouTube synchronization is a one-way mirror on canonical content changes.
Media supersession invalidates evidence for an old source; it cannot approve
replacement media. Credits handling normalizes the authorized transaction's
content. Version binding records content-derived immutable lineage and makes
old reviews unusable after content changes. AFTER INSERT history records only
the actual inserted row, including when an INSERT candidate loses ON CONFLICT.

Executable classifications require the exact function body, owner, search
path, grants, protected source-table/column ACLs, caller chain and attachment.
Entry attachments additionally pin `pg_get_triggerdef` fingerprints, including
UPDATE column lists. A later attachment change reopens the finding. The
participant display mirror and media invalidation are consequences of Entry
truth, not replacement Entry authorities; this proof does not certify unrelated
lineup or media-management capabilities.

`.github/tests/v3-entry-runtime-boundary.sql` runs after clean replay and
current-main upgrade using the existing mechanism-proof generator. It proves
real source reconciliation, scoped consequences, CAS/recovery, changed retry,
revoked session/capability, transport denial, immutable versions and rollback on
receipt/audit/event failure. Confirmation restoration and final-review SQL
regressions run alongside it. The catalog JSON under `.github/fixtures` is only
a structural unit-test snapshot; release evidence is regenerated separately for
the checked-out candidate.
