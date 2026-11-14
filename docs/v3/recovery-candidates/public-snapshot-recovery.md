# Local active capture and public immutable read model

This stage reuses the exact current canonical active-participant capture and
public publication-safe snapshot definitions. It never rewrites stored versions,
current Results rows, publication state, or historical migration records.
It follows the existing ordered S13/Archive/S07 fixture and atomic reference.

A new owner-authorized catalog-only observation at 2026-11-13T21:37:32Z confirms
three existing helper fingerprints, owners, ACLs and search paths, three table
security contracts and their enabled triggers, and the absent public snapshot
RPC. The generator refuses any mismatch, including a partial/duplicate install.
Existing immutable mutation guards and publication validation triggers are not
changed. The capture changes only future version membership, using confirmed
country/entity identities from the canonical source. Public readback remains
bound to frozen version identity and authoritative publication readiness.

Run `node scripts/stage-v3-public-snapshot-recovery.mjs` to generate the **local
candidate**, not an approved live operation. Its transaction registers the public
read-model contract plus a distinct capture-only recovery contract; it does NOT
claim the entire active qualification migration is adopted. Qualification,
countback, canonical show calculation and their reconciliation upgrades remain
separate prerequisites for the complete release recovery chain.

The existing networkless PG17.11 job seeds historical versions under the old
capture, installs this stage, and exercises new active capture, anonymous exact
version readback, hidden/unknown show refusal, allocation visibility, historical
storage preservation, interrupted rollback, same-DB retry and duplicate refusal.
Synthetic fixture state is explicitly separate from catalog equivalence; no
hosted testing is performed. Existing hosted-only notification guards remain in
the full fixture and are protected by the earlier security checkpoint.

Production is NOT repaired or certified by this stage. Complete relevant
column/data/role equivalence, all Results authority dependencies, backup readiness,
risk-tiered source review, exact SQL/hash/source approval and post-adoption catalog
verification are still required. No production SQL, deployment or activation is
authorized by this local artifact.

## Current nested helper qualification

The owner-authorized catalog-only observations at 2026-11-13T21:46:27Z and
21:49:08Z qualify the existing edition/show qualifier refreshers, participation
subject key, publication readiness wrapper and missing-result materializer.
Their definition SHA256 values match the prior 727-routine evidence; current
owner, complete ACL, configuration/search path and MD5 are now asserted in the
same real PG17.11 reconstruction. Unknown or mismatched scope, project, role,
privileges or definitions fail closed. These are pre-existing hosted helpers,
not new production functions installed by the snapshot candidate.

Runtime tests additionally attempt owner mutation of stored immutable evidence
and anonymous direct reads, check every returned identity, and exclude private
Jury/Televote component fields from every anonymous row. These tests complement
source-exact calculation/capture checks; they do not qualify all production data
shapes or unresolved canonical Results/qualification recovery stages.

The local atomic-reference prerequisite now also reproduces the separately
observed `auth.uid()` owner (`supabase_auth_admin`) and complete EXECUTE ACL,
including PUBLIC and dashboard_user, without changing its body. The imported
fixture previously kept the correct body under postgres/default ACL instead.
The new fixture correction refuses the actual hosted owner before any DDL,
checks both definition hashes and the frozen ACL digest, and exercises rollback,
retry and duplicate refusal before the authenticated calculation tests. The
minimal dashboard_user NOLOGIN role represents an observed grantee identity;
its other hosted role attributes are not certified. This is strictly a local
reconstruction, never a proposed production auth ownership/grant change.
