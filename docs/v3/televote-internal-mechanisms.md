Televote runtime mechanism proof

The 26 distinct trigger findings resolve to guards, housekeeping and consequences,
not additional command authorities. The generated report includes each accepted
classification and its executable proof. Classification does not depend on a
trigger name: it requires the reviewed full function-definition fingerprint,
owner, SECURITY INVOKER/DEFINER mode, fixed search path, exact owner-only EXECUTE,
actual enabled attachment and timing, protected table and column privileges, and
the complete reviewed caller chain. Drift restores the original critical finding.
PUBLIC table privileges are collected explicitly; unknown grant roles also fail.

The contracts group 11 invariant functions, five housekeeping functions, seven
projection/invalidation functions and three owner-only command implementations.
The two direct lifecycle guards deliberately remain invokers: changing their
execution identity would disable their current_user checks. The normalization
trigger no longer creates a random custom entry identity; save_custom already
owns that decision. It retains an existing identity and normalizes country keys.

The projection chain reads canonical published source rows and versions. It does
not accept an API actor or a caller-selected authoritative snapshot. Its internal
apply primitive is reachable only through the pinned source loaders and their
triggers. Repeating the same source/version is a no-op, drift can be repaired from
the same source, stale or changed versions fail, and failure in final result sync
rolls back the projection and provenance together. Official Results behavior and
its frozen owner are unchanged.

Executable proofs:

- src/lib/v3-s16-internal-mechanisms.test.ts attacks definition, owner, execution
  mode, PUBLIC/service/inherited grants, search path, callers, columns, and binding.
- scripts/generate-v3-internal-mechanism-proof.ts materializes the reviewed
  contracts into .github/tests/v3-televote-internal-mechanisms.sql. It verifies the
  live catalog, canonical custom identity and membership/version consequences,
  wrong-scope and late/sanctioned ballot denial, direct status/deadline denial
  under hostile temporary fixture grants, and revoked moderation sessions.
- .github/scripts/v3-s14-televote-result-truth-replay-hardening-rehearsal.sh proves
  projection replay, deterministic repair, no amplification, stale and changed
  requests, and atomic rollback. Its test-only instrumentation is always removed.

These proofs run in v3-canonical-writer-rehearsal.sh against isolated local
PostgreSQL, alongside the existing canonical commands. This is focused authority
verification; it does not stand in for the full one-state contest S14 rehearsal.
