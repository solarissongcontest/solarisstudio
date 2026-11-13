# Ordered local S13 → Archive → Televote recovery

This extends the existing 215-table, networkless PG17.11 recovery job. No new
canonical writer, production migration or second recovery generator is added.
The current main S07 generator supersedes the older unsigned source-truth copy
in #2404: it preserves signed Combined deductions, replay repair and owner-only
payload execution with transaction/show-scoped context.

The original 90-row catalog comparison runs BEFORE S07. Missing production
interfaces remain absent in that checkpoint; tests must not relabel them as
adopted. After the existing S13/Archive tests, the job installs source-generated
S07, checks API role denial against the real reconstructed relations, injects
post-DDL failure and proves schema rollback, retries, and refuses duplicates.
The existing dedicated S07/S08 synthetic voting suite separately covers official
round/Combined projection, signed deductions, replay, moved shows and receipts.
Those two evidence levels do not establish full hosted data/runtime equivalence.

## Observed prerequisite

Owner-authorized bounded read-only catalog query, canonical project
`dkxmnvekiopyesuzggeu`, 2026-11-13T20:06:42.360888Z, PG170011. Read-only transaction,
10s statement/2s lock timeout, rollback; no business rows/calls or raw bodies.
`pgcrypto` version1.3 exists in schema extensions, owner postgres.
`extensions.digest(bytea,text)` is language C, SECURITY INVOKER, postgres-owned,
definition MD5 `85b88685f74a398b1ff164ad33eeaaca`, executable by the three API roles.
The local-only extension installation must reproduce the definition fingerprint;
it is not proposed hosted SQL (the production prerequisite already exists).

## Limits and next dependency

No production changes, history writes, deployment or activation are authorized.
The new atomic calculation and public immutable snapshot interfaces are NOT
installed by S07. Those require their own reviewed dependency/upgrade contract.
S08 all-show authority and legitimate Combined correction remain separately
required. Full hosted grants/RLS/data shapes, backup readiness and exact-SHA
release certification remain unproven; release remains NO-GO.
