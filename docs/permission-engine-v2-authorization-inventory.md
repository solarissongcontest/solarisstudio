# Permission Engine v2 authorization inventory

Status: shadow plus dual-path migration foundation. The current organizer gate remains authoritative. Organizer route decisions are recorded for comparison, while the remaining Studio 2 jury and rollout writes now accept reviewed capability paths without enabling the global Permission Engine flag.

## Decision model

- Global role assignments and direct grants apply to every edition.
- Edition-scoped assignments apply only when that edition is the request context.
- Expired assignments and grants never evaluate as active.
- Existing `user_roles` values are mapped to the matching v2 presets so current organizers and viewers retain equivalent capability results during shadowing.
- Protected mutations execute through `SECURITY DEFINER` RPCs with fixed search paths and explicit execute grants. Authorization is based on `auth.uid()` and server-owned roles or grants, never editable profile metadata.
- “View access as” returns only a read-only projection. It never changes the session, JWT, role, request context or RLS identity. The projection now explains all seven Organizer domains, the routes that would be discoverable and the actions that would be enabled; raw capability keys remain under progressive disclosure.

## Operation matrix

| Product domain | Representative operation   | Current authority                            | v2 capability             | Scope          | Phase-1 behavior                                   |
| -------------- | -------------------------- | -------------------------------------------- | ------------------------- | -------------- | -------------------------------------------------- |
| Edition        | View private runtime       | Organizer role or existing capability helper | `edition.read`            | Edition/global | Shadow-compatible                                  |
| Edition        | Change configuration       | Organizer role or helper                     | `edition.manage`          | Edition/global | Dual-compatible                                    |
| Edition        | Lifecycle transition       | Organizer + governed approval where required | `edition.transition`      | Edition/global | Catalogued; legacy remains authoritative           |
| Edition        | Archive edition            | Organizer role or helper                     | `edition.archive`         | Edition/global | Dual-compatible                                    |
| Delegations    | View private readiness     | Organizer or owned-country rules             | `delegation.read`         | Edition/global | Catalogued                                         |
| Delegations    | Manage roster/access       | Organizer or owned-country rules             | `delegation.manage`       | Edition/global | Catalogued                                         |
| Confirmations  | View responses             | Organizer or owned-country rules             | `confirmation.read`       | Edition/global | Dual-compatible                                    |
| Confirmations  | Open/manage responses      | Organizer or owned-country rules             | `confirmation.manage`     | Edition/global | Dual-compatible                                    |
| Entries        | View unreleased entry      | Organizer/owner plus publication rules       | `entry.read_private`      | Edition/global | Dual-compatible                                    |
| Entries        | Edit canonical entry       | Organizer/owner                              | `entry.edit`              | Edition/global | Dual-compatible                                    |
| Entries        | Approve readiness          | Organizer                                    | `entry.approve`           | Edition/global | Dual-compatible                                    |
| Entries        | Release to public          | Organizer plus publication state             | `entry.publish`           | Edition/global | Catalogued; publication safeguards remain separate |
| Voting         | View operations            | Organizer                                    | `voting.read`             | Edition/global | Catalogued                                         |
| Voting         | Configure windows/rules    | Organizer                                    | `voting.manage`           | Edition/global | Catalogued                                         |
| Jury           | View protected ballots     | Organizer/helper                             | `jury.ballots.read`       | Edition/global | Dual-compatible                                    |
| Jury           | Operate/correct ballots    | Organizer                                    | `jury.ballots.manage`     | Edition/global | Catalogued                                         |
| Televote       | View protected ballots     | Organizer/helper                             | `televote.ballots.read`   | Edition/global | Dual-compatible                                    |
| Televote       | Operate/exclude ballots    | Organizer                                    | `televote.ballots.manage` | Edition/global | Catalogued                                         |
| Results        | Preview unreleased totals  | Organizer/helper                             | `results.preview`         | Edition/global | Dual-compatible                                    |
| Results        | Verify calculations        | Organizer/helper                             | `results.verify`          | Edition/global | Dual-compatible                                    |
| Results        | Publish verified result    | Organizer/helper plus result state           | `results.publish`         | Edition/global | Dual-compatible                                    |
| Incidents      | View incident command      | Organizer                                    | `incident.read`           | Edition/global | Catalogued                                         |
| Incidents      | Command response           | Organizer/helper                             | `incident.manage`         | Edition/global | Dual-compatible                                    |
| Incidents      | Resolve incident           | Organizer                                    | `incident.resolve`        | Edition/global | Catalogued                                         |
| Communications | View drafts/delivery       | Organizer/recipient policy                   | `communications.read`     | Edition/global | Catalogued                                         |
| Communications | Draft/schedule/send        | Organizer/helper                             | `communications.send`     | Edition/global | Dual-compatible                                    |
| Communications | Archive/delete             | Organizer/helper                             | `communications.manage`   | Edition/global | Catalogued                                         |
| Rules          | View private drafts        | Organizer                                    | `rules.read`              | Global         | Catalogued                                         |
| Rules          | Draft interpretations      | Organizer/helper                             | `rules.edit`              | Global         | Dual-compatible                                    |
| Rules          | Publish release            | Organizer plus validation                    | `rules.publish`           | Global         | Catalogued                                         |
| Integrity      | View protected cases       | Organizer/helper                             | `integrity.read`          | Global/edition | Dual-compatible                                    |
| Integrity      | Investigate                | Organizer/helper                             | `integrity.manage`        | Global/edition | Dual-compatible                                    |
| Integrity      | Apply sanction             | Organizer plus governed workflow             | `integrity.sanction`      | Global/edition | Catalogued                                         |
| Publishing     | View release state         | Organizer                                    | `publishing.read`         | Edition/global | Catalogued                                         |
| Publishing     | Prepare release            | Organizer                                    | `publishing.manage`       | Edition/global | Catalogued                                         |
| Publishing     | Execute release            | Organizer plus canonical state guards        | `publishing.publish`      | Edition/global | Catalogued                                         |
| Broadcast      | View plans/rundown         | Organizer                                    | `broadcast.read`          | Edition/global | Catalogued                                         |
| Broadcast      | Operate live cues          | Organizer/helper                             | `broadcast.control`       | Edition/global | Dual-compatible                                    |
| Broadcast      | Configure operators/assets | Organizer                                    | `broadcast.manage`        | Edition/global | Catalogued                                         |
| Rollout        | View feature state         | Organizer                                    | `rollout.read`            | Edition/global | Catalogued                                         |
| Rollout        | Change eligible flags      | Organizer plus dependency engine             | `rollout.manage`          | Edition/global | Catalogued                                         |
| Permissions    | View catalog/users         | Organizer or access manager                  | `permissions.read`        | Global         | Shadow check recorded                              |
| Permissions    | Assign/revoke access       | Organizer or access manager                  | `permissions.manage`      | Global         | Enforced in new RPCs                               |
| Permissions    | Review mismatch log        | Organizer or access manager                  | `permissions.audit`       | Global         | Enforced in new RPCs                               |

Country ownership, public publication rules, transition approvals, result verification state, incident lifecycle rules and rulebook validation remain independent safeguards. A capability cannot bypass those domain constraints.

## Presets

| Preset             | Intended use                                         | Notes                                                       |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| Superadmin         | Emergency platform administration                    | Full catalog; assign sparingly                              |
| Organizer          | General contest administration                       | Full catalog; mirrors the legacy organizer during shadowing |
| Results Manager    | Voting review and results release                    | No user/role administration                                 |
| Integrity Officer  | Investigations, evidence, sanctions and rule context | No results publication or rollout control                   |
| Broadcast Operator | Rundown and live cue operation                       | Can preview results for rehearsal; cannot publish them      |
| HOD                | Delegation, entry, communications and voting work    | Intended to be edition-scoped                               |
| Viewer             | Read-only operational visibility                     | Includes only catalog entries marked `read`                 |

## Legacy debt snapshot

Production inventory captured 2026-09-14:

- 82 RLS policies across 59 tables still mention `has_role`.
- 58 public/private functions still mention `has_role`.
- Seven storage policies are included in that policy total.
- The largest individual policy concentration is `storage.objects` (7), followed by `participants` (3); the remaining tables have one or two legacy policies each.

These references are migration work, not permission mismatches. They remain intentionally unchanged until each table or RPC has an operation-level capability mapping, an edition-scope test and a rollback-safe migration.

## Promotion gates

The `permission_engine_v2` flag stays disabled until all of the following are true:

1. High-risk writes are dual-enforced server-side with table/RPC tests.
2. Shadow telemetry covers meaningful organizer routes and has an understood observation window.
3. Every mismatch is classified as expected legacy compatibility, missing assignment, missing scope, or implementation defect.
4. “Legacy allow / capability deny” is zero for required operators after role assignment.
5. “Legacy deny / capability allow” is zero unless a reviewed delegation explicitly requires it.
6. Security and performance advisors introduce no unexplained finding from this migration. Authenticated `SECURITY DEFINER` RPC notices are expected for the guarded API boundary; anonymous execute remains revoked.
7. Exact-head Quality and Browser Audit pass before merge, followed by post-merge verification on `main`.

## Completed migration batches

- `20260914035152_permission_engine_v2_foundation`: capability catalog, presets, assignments, direct grants, shadow telemetry and guarded admin RPCs.
- `20260914035308_permission_engine_v2_fk_indexes`: covering indexes for the new permission foreign keys.
- `20260914041917_permission_engine_v2_dual_enforcement`: capability-aware jury roster and feature-rollout paths, including global-scope protection across existing and requested rollout scopes.
- Organizer route shadow probes cover the shared shell, and the access simulation explains domains, routes and actions without impersonation.

The remaining cutover work is server/RPC/RLS coverage, strict sensitive-action dual enforcement, mismatch observation and classification, then authoritative capability enforcement. The rollout flag remains disabled until those gates pass.
