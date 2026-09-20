# Public IA v3 retirement readiness — 2026-09-20

## Decision

Legacy public navigation retirement is **blocked by insufficient evidence**. The
rollback implementation must remain available until the existing Beta 3 release
gates and the required manual certification pass.

This is an evidence decision, not a rollback of Public IA v3. Production remains
globally enabled for v3.

## Production boundary

- Canonical application commit inspected: `3d1debe7f0f43114f05eeebe5e73932bd0ef055b`
- Global flag: `public_ia_v3.enabled = true`
- Organizer-only restriction: `false`
- Global-promotion timestamp: `2026-09-19T22:03:33.209072+00:00`
- Supabase production project: `solaris-studio-production`

## Evidence snapshot

Captured at `2026-09-20T07:41:55.903310+00:00`:

| Signal                           | Post-promotion evidence |
| -------------------------------- | ----------------------: |
| Public UX sessions               |                       2 |
| Public UX events                 |                      26 |
| Searches submitted               |                       1 |
| Zero-result searches             |                       0 |
| Measured task starts             |                       8 |
| Measured task completions        |                       0 |
| Field-vitals samples             |                     121 |
| Routes with field-vitals samples |                      34 |
| Poor field-vitals ratings        |                       8 |
| Completed Beta 3 responses       |                       0 |
| Beta 3 first-click runs          |                       0 |

The observed poor field-vitals samples include CLS regressions on several public
routes and a poor mobile INP sample group on `/`. Sample counts per route/device
group remain small, so the signal requires investigation rather than a broad
performance conclusion.

## Existing Beta 3 release gates

The application continues to use the established criteria:

- at least 10 completed responses;
- at least 90% core-task success;
- at least 80% observed first-click success;
- at least 90% old-edition lookup success;
- no more than one country-entry lookup failure;
- no more than a five percentage-point mobile/desktop success gap.

No threshold was lowered or replaced. With zero completed Beta 3 responses and
zero first-click task runs, the evaluator cannot produce a passing result.

## Technical preparation completed

`/admin/public-ux` now evaluates the precise post-promotion window and presents:

- rollout state and promotion timestamp;
- post-rollout sessions, events and field-vitals samples;
- all six existing Beta 3 release gates with sample counts;
- first-click coverage;
- task-completion and poor-vitals warnings;
- an explicit distinction between sufficient automated evidence and the still
  required manual role/route/mobile smoke certification.

The dashboard deliberately cannot declare legacy retirement complete by itself.
Quality CI and direct production smoke testing remain mandatory.

## Next evidence action

Collect a comparable Beta 3 sample, investigate the route-level poor Core Web
Vitals signals, complete the role/device production smoke matrix, and rerun the
dashboard gate. Do not remove `LegacyPublicNavigation` or the runtime rollback
branch until those checks pass.
