# Confirmation restoration

The existing restore command now requires the response revision shown in review, a stable operation ID and its idempotency key. It checks live session and current capability before recovering a receipt, locks the round/content/response in canonical order, rejects stale or archived writes, and atomically appends history, restores content, writes audit and completes its receipt. Completion emits one durable Confirmation observation through the existing outbox; event failure rolls the operation back.

The historical implementation is an owner-only primitive behind the governed command. Its moderation, pending review, immutable history and Entry provenance behavior is preserved. S16 classification requires exact code fingerprints, closed source privileges and the complete caller chain, rather than its name alone.

The UI retains the exact reviewed request per actor and response. It recovers pending receipts before comparing history, including on reload, and then runs the existing Solaris reconciliation. It cannot infer success merely from a newer history row or rotate identity after transport loss.

Proofs: `.github/tests/v3-confirmation-restore-authority.sql` and `src/lib/v3-confirmation-restore-*.test.ts`. The SQL proves authorization, CAS, response-loss recovery, changed-request rejection, one audit/history/event, durable deliveries, actor provenance, rollback on event failure, private legacy boundaries and revoked-session denial.
