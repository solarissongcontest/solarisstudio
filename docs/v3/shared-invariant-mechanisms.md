# Shared invariant and housekeeping mechanisms

Migration 542 closes raw writes to review and participation CAS rows, removes
leftover National Final TRUNCATE privileges, and makes technical trigger
functions owner-only with fixed paths. SELECT behavior is preserved. The
scalar Combined version guard retains its original pg_catalog-only path.

The 23 additional mechanism contracts describe guards and bounded housekeeping.
They do not sanction the remaining response/requirement, manual Jury, restoration
or Results writers. Guards reject invalid scope, ownership, raw review or
lifecycle changes without deciding a new business state. Housekeeping advances
server-owned counters or timestamps for affected source keys. INVOKER guards
retain their security mode because current_user is part of their invariant.

Classification verifies the actual function definition, owner, security mode,
EXECUTE grants, fixed path, call graph, protected source table/column privileges,
and enabled trigger bindings. Shared functions require a separate valid source
and attachment proof for each domain; a cached function proof cannot authorize
a different table. The observed catalog fixture and adversarial unit tests prove
that table grants, column grants and attachment drift fail independently.

The canonical writer rehearsal runs the generated live-catalog SQL proof,
canonical round/review/participation/Jury-window operations, exact retry and stale
review checks, scope-bounded counter checks, and hostile ACL/RLS drift tests.
The hostile grants and policies exist only inside a rolled-back fixture. The
existing S3 Confirmation, Jury and Entry rehearsals independently exercise
requirement generations, country/edition/ballot ownership, immutable history and
version-pointer tampering. The final Entry review reconciliation regression
remains required. This focused verification does not substitute for full S14.
