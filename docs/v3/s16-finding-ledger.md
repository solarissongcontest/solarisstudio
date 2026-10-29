S16 finding accounting
=====================

The canonical `check-v3-s16-mutation-authority.ts` producer writes an exact-SHA
`s16-finding-ledger-<candidate SHA>.json` alongside its authority report. The
report includes the artifact name and reconciled totals. This ledger records
unresolved findings; successful internal-mechanism proofs remain separately
visible in `internalMechanismClassifications`.

Every raw occurrence has a stable finding identity, an evidence fingerprint,
source location or database object, mutation target, caller, domain owner,
classification, proof status, evidence reference and disposition. Source
mutation locations come from syntax analysis. Database evidence records exact
definition hashes, attachment timing/events, ACLs and catalog caller signatures.
The fingerprint changes when that evidence changes; database OIDs and candidate
SHA are excluded from the identity so replay does not invent a new issue.
Trigger identity includes its target table, and database writer identity includes
its overload signature. Reusing a trigger or function name cannot collapse
distinct database objects into one finding.

`raw_source + raw_runtime = raw_total`. Raw duplicate occurrences are retained
by index. The release classifier can add supplemental findings, so
`raw_total - raw_duplicates + supplemental_release_findings = classified_total`.
Classified totals must also equal Results-owned plus shared, with zero
unexplained findings. Missing classification, unknown ownership or a catalog
SHA mismatch fails reconciliation. Results ownership determines where a defect
must be fixed; it does not reduce its release risk. Zero Conditional findings
alone never means S16 passed. The authority gate still requires zero unresolved
findings and now also requires reconciled accounting.
