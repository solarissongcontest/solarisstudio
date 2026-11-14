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

## Missing Results prerequisite corrected in the reconstruction

The first ordered attempt refused `public.sync_show_results_from_votes(uuid)`:
it exists in production but was absent from the199-routine fixture. A bounded
owner-authorized catalog-only read confirmed its independently frozen SHA256
`4deff875c74e40bb6ba7642cb449cdaa91c45ae157f55a430ae7f53f31e5c541`,
MD5 `8301a60a5e193323662e184637092810`, owner postgres, SECURITY DEFINER,
search_path public,pg_temp and owner/service_role-only EXECUTE. The local stage
extracts its unchanged definition from the immutable20261003195500 source,
refuses existing definitions and atomically checks both digests plus the security
contract. This reconstructs the existing hosted writer; it does not introduce
or authorize another Results writer. The newer countback/Results authority
upgrades remain a separate stage, not silently substituted for the baseline.

Successful execution now proves the same-DB ordered installation with real
hosted-observed relations and source-derived permission helpers. Positive ballot,
Combined deductions and replay tests remain the separate, explicitly synthetic
S07/S08 suite. Full hosted application-state behavior is still NOT certified.
