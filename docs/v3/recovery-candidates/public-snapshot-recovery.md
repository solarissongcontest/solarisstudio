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
independent review, exact SQL/hash/source approval and post-adoption catalog
verification are still required. No production SQL, deployment or activation is
authorized by this local artifact.
