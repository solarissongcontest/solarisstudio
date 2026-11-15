# Canonical Media finalization: source integration and adoption boundary

Current-main port of the Media-only authority/byte-identity work from PR #1847
(`ded9a1ad7a320bad1c62c04a1e81ac3c1ef350f7`). Its stale stacked branch and
unrelated registry changes are not merged.

`20261115204228_v3_media_finalization_authority.sql` installs the existing
canonical worker finalization/readback contract, closes API table/column writes,
and commits upload state, durable receipt and `media.verified` together.
Finalization binds the capability, actor, live Auth session, Storage object
identity, size and exact byte digest. New mutations independently check platform
mode and current country/artwork authority. Replays retain the committed result
after the upload window expires; changed terminal content is rejected.

The Edge worker retains existing byte processing and now delegates database
state to that command. It reads published bytes back, hashes first/duplicate
publication and verified replay, requires a matching canonical receipt, and
preserves quarantine bytes on uncertain persistence. Thumbnail failure never
removes an immutable final object that a concurrent request may have committed.
Country/background/font consumers detach references without deleting published
bytes. Storage transfer and database commit are separate services: an unbound
immutable object may remain after failure and requires governed retention.

## Two distinct operator authorities

Bounded catalog evidence in `evidence/media-authority-observed-2026-11-15.json`
confirms the new RPCs absent, the existing upload table, actual Storage table
owners/grants and three browser DELETE policies. No application rows, bytes,
secrets or raw production function bodies were retrieved.

Production `postgres` is NOSUPERUSER and cannot SET ROLE
`supabase_storage_admin`. It has the required Storage metadata reads but cannot
own the policy cutover. The main migration deliberately does not pretend to
have that authority. After separately approved recovery prerequisites, the
exact `media-storage-policy-owner-cutover.sql` must execute as the actual
Storage owner using a secured authorized provider/operator path. It verifies
three exact observed policy fingerprints, removes only those three policies,
preserves every unrelated policy/RLS setting, and rejects wrong role, drift
and duplicate application. It writes no migration-history rows. Do not grant
postgres a broad Storage-owner bypass to make the operation pass.

The owner-only artifact is a separate mandatory adoption condition; source
integration does not install it or authorize production execution. An approved
operator with that role is not available through this session's credentials.

## Verification scope

The existing networkless PG17.11 recovery driver adds the Media DB migration
as stage18 after the17 established stages. Auth fixture rows are created by
their owner; Media commands execute under real API roles. Tests cover direct
DML/TRUNCATE denial, prepare, capability/session mismatch, revoked country
rights, mode denial, missing/hashless objects, exact-byte replay, changed-byte
conflict, expiry recovery, receipts/events and transactional failure/retry.
The separate Storage-owner probe tests exact observed policy shape, wrong
operator, drift, successful removal and duplicate refusal on PostgreSQL17.11.

**Limit:** Storage uses selected provider-source metadata, not a complete
Storage-service or hosted-data reconstruction. Actual Storage file transfer,
full provider triggers, all recovery dependencies, same-database recovered
66-country acceptance and full S16 certification remain unproven. Existing
November15 owner-reported encrypted DB/Storage backups and scoped restore are
preserved; this test does not recertify them or transfer private material.
No hosted tests, SQL writes, history repair, deployment, maintenance change or
public-write activation are performed by this work.
