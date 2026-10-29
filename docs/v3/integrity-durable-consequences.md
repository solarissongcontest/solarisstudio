# Integrity consequences

Migration 539 observes immutable adjudication history in the same transaction as
the case or appeal command. Each history UUID owns one observation receipt, one
S4 event, and one `integrity.workflow` delivery. The original adjudication receipt
and its retry identity remain unchanged. An enqueue failure rolls back the
original command rather than committing an unobservable adjudication.

The owner-only, bounded `v3-integrity-consequences` cron job repairs missing
historical observations and applies pending deliveries. The authenticated
case-scoped reconciliation/readback RPCs require an active session and canonical
Integrity capabilities. Service-role possession grants neither reconciliation
nor case mutation authority.

The consumer derives case and appeal review tasks from current canonical rows.
It does not replay old status payloads or modify cases, appeals, sanctions, or
history. The appeal command continues to apply any case/sanction change in its
original transaction. Task changes, the immutable consumer application receipt,
and outbox completion commit together. A task failure leaves the adjudication
correct and a durable pending delivery with a bounded retry. A generic transport
acknowledgement cannot substitute for the consumer application receipt.

`.github/tests/v3-integrity-durable-consequences.sql` proves enqueue rollback,
derived-task failure and recovery, current-state reconciliation after an older
event, immutable application receipts, exact operation retry, changed-request
denial, stable observation identity, duplicate suppression, readback, revoked
sessions, missing capability, and coherent appeal/sanction outcomes. Existing
appeal outcome, recusal, recovery, and concurrent resolution rehearsals remain
required. The canonical writer rehearsal runs the new SQL fixture.
