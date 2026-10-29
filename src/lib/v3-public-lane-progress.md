# Session 2 Public lane progress

This branch owns Public / Fan / Participant route-content parity only.

Current source changes:

- Participate blocker-first canonical priority.
- Fail-closed V3 primary read error/retry state once V3 rollout is active.
- Focused regression coverage for Participate priority and authoritative-read failure.
- Explicit contract coverage documenting the current participant-voting read-model boundary.
- Official-notice state and route safety coverage.
- Account/session safety coverage for authoritative sign-out, revocation reconciliation and fail-closed session reads.

Backend/system work is not duplicated here. A System contract request for non-open Jury/Televote overview state is recorded on coordination issue #574.
