# S15 source classification and owner repair batch

The complete starting inventory is [v3-release-burndown.json](v3-release-burndown.json): 43 Public cutovers, 81 Organizer cutovers, and 40 consequences. It records each exact finding, owner, actual source/test paths, classification rationale, and required repair. This is a working source audit of `96b76574b86f24c6f9ed5089ec853759683d7ab6`, **not acceptance or release evidence**.

Initial classification totals: 78 implementation-present/evidence-missing; 82 partial; one missing implementation/definition; three obsolete/replaced concepts. A source-present feature still needs its real route/control acceptance, authorization, canonical operation/readback, activation and rollback proof. Common shell tests are not acceptance for 124 independent capabilities.

## Implemented repairs

- Authenticated route identity is scoped to the active fan-session user, verified through server `getUser`, and purged on account change. The identity query no longer shares a cached server identity across A, sign-out and B. Actual QueryClient/QueryObserver tests cover private/public cache isolation, delayed A identity reads and delayed getSession reads that could overwrite a newer SDK session event.
- Capability-filtered Organizer task rows/counts are scoped by actor after the existing edition prefix, and both roots are purged/cancelled on account changes. Existing edition-prefix invalidations remain valid; real QueryClient regressions prevent delayed A task reads from overwriting B.
- Contest edition roots are owned by Organizer Control in the actual routing helper, including discovery placeholders; malformed/unknown routes retain More ownership.
- Search and Scoreboard now point to their real shell-overlay and embedded show-detail owners. Explicit former-route relationships remain. Their feature cutovers are not falsely accepted.
- The maintenance-only teaser endpoint is accepted with actual built Worker SSR across all five fixture screens, full/content chrome, GET/HEAD, canonical redirects, noindex metadata and rejected writes. Network access is prohibited during the probe. The real route returns router 404 after launch before fixture loading. This does not accept the five product capabilities represented by fixtures.
- `receipt.reconciled` is explicitly replaced by the existing bounded, actor-scoped, STABLE canonical receipt read. It remains in the catalog and is never called event-backed. Reading a receipt does not fabricate a second mutation, analytics event or invalidation. A strict manifest rejects forged replacements and leaves all genuine declared mutations blocked. The local receipt rehearsal checks repeated own reads, foreign denial, server volatility, unchanged canonical receipts, and unchanged DomainEvent/outbox cardinality.

## Validation and progress

The managed execution environment initially failed provisioning. Source edits were batched on an isolated GitHub branch; after the workspace was restored, narrow tests and historical before/after reproductions were executed locally before further publication. Stateful database validation continues in isolated GitHub Actions; the full local Docker rehearsal is not retried. No published history is rewritten.

Completion and sanitized public-readiness projections use the same validated consequence predicate as the release guard. The dashboard separately reports event-backed delivery, read replacements and genuinely unresolved effects; a canonical read is not mislabeled as either a delivered event or an unimplemented mutation.

Status-history validation now covers supplementary Public capabilities as well as the primary registry, rejecting backward transitions and silent removals while preserving canonical row moves.

Cascade discovery validates the complete audit and emits `v3-release-preflight/static/s15-burndown.json` alongside live canonical findings. The audit can pass while readiness is red; it never promotes readiness. It rejects unclassified live findings, duplicate rows, invalid classifications, unexplained work and missing implementation/test references.

Pure regressions are reproduced against the starting source in a temporary checkout, using the same installed dependencies and loopback-only static environment, before running on the current candidate. These historical regression logs are not older-SHA release certification. The six original focused database suites remain unchanged; a seventh isolated receipt check adds actual read-only replacement proof. Full S14, late S15 evidence and final Browser certification stay blocked whenever readiness is nonzero.

The focused burn-down progresses 164 -> 163 through the proven read-only receipt replacement, then -> 162 through the independently accepted restricted teaser endpoint. Final observed counts must come from the candidate's cascade artifacts. Only the teaser Public status changes; all other Public and all Organizer cutover statuses remain unchanged. The source classification was refined against existing behavioral contracts: eighteen initially route-present Organizer entries contain documented server gaps and are correctly classified partial.

## Concrete unresolved owner work

Every unresolved ID/owner and required repair is retained in the machine inventory and live artifact; no generic suppression is introduced. Examples establishing why a bulk status promotion is unsafe:

| ID | Owner / missing authority |
| --- | --- |
| `participant-activity` | Participation/activity: caller-scoped `v3_my_participant_activity` System #605 projection/RPC remains unavailable. |
| `pulse` | Public activity: System-owned event projection must exclude future/unpublished/private content. |
| `taste-dna` | Personal-preference / Results: V3 replacement and overlap with Voting DNA remain undefined. |
| `live-review-reveal-director` | Reveal/broadcast: governed Armed/Live operation lifecycle is explicitly unavailable. |
| `delegation-edition-links` | Delegation System #702: canonical versioned/idempotent binding edit is absent. |
| `current-edition-broadcast` | Broadcast System #625: direct multiwrite path lacks atomic CAS/receipt authority. |
| `operations-incidents` | Integrity/incidents: resolution and transition are separate writes with a failure window. |
| `voting-televote-totals` | Voting System #585: sequential compatibility writer lacks atomic operation/receipt contract. |
| `voting-public-results` | Results: atomic official conversion remains the frozen Results-specific PR #1400 residual; it is not a shared prerequisite and is not imported here. |
| `fantasy.changed`, `fantasy.scored` | Fantasy System #630: scoring exists, but the V3 operation envelope and declared effects are incomplete. |

PR #1400, its migrations and frozen Results residual remain untouched. No automated testing uses hosted Supabase. No budget or authorization/readiness/lifecycle invariant is relaxed. This batch cannot make PR #1629 merge-ready while these owners remain unresolved.
