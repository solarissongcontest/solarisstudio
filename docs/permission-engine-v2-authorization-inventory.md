# Permission Engine v2 authorization inventory

Status: authoritative capability enforcement. Permission Engine v2 is the authorization source for Solaris Studio; legacy `user_roles` data is retained read-only only as rollback/history context. Route decisions continue to be recorded for audit and troubleshooting.

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
| Edition        | Lifecycle transition       | Organizer + governed approval where required | `edition.transition`      | Edition/global | Strict dual at authoritative table boundary        |
| Edition        | Archive edition            | Organizer role or helper                     | `edition.archive`         | Edition/global | Strict dual at authoritative table boundary        |
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
| Incidents      | Command response           | Organizer/helper                             | `incident.manage`         | Edition/global | Strict dual at authoritative table boundary        |
| Incidents      | Resolve incident           | Organizer                                    | `incident.resolve`        | Edition/global | Strict dual at authoritative table boundary        |
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
| Rollout        | Change eligible flags      | Organizer plus dependency engine             | `rollout.manage`          | Edition/global | Strict dual at authoritative table boundary        |
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

The migration began from the production inventory captured on 2026-09-14: 82 RLS policies and 58 functions still referenced the legacy Organizer role.

The completed cutover removes direct legacy-role predicates from application RLS, rewrites the remaining compatibility helpers to capabilities, preserves live Organizers as explicit v2 assignments, and freezes `user_roles` as read-only rollback/history data. The authoritative migration fails closed if any application RLS policy or live authorization function still depends on `public.has_role`.

## Authoritative acceptance gates

The authoritative cutover requires all of the following and verifies the database-side invariants during migration:

1. Every live legacy Organizer has an active v2 Organizer or Superadmin assignment.
2. Application RLS contains zero direct `has_role` predicates.
3. Live authorization helpers contain zero direct `public.has_role` fallbacks.
4. Sensitive operations use capability checks while retaining their independent domain safeguards.
5. Route telemetry has real observations and no unexplained legacy/capability mismatches.
6. Exact-head Quality, Browser Audit and migration/security replay pass before production rollout and merge.
7. `permission_engine_v2` is globally enabled with no user- or edition-scoped rollout restriction.

## Completed migration batches

- `20260914035152_permission_engine_v2_foundation`: capability catalog, presets, assignments, direct grants, shadow telemetry and guarded admin RPCs.
- `20260914035308_permission_engine_v2_fk_indexes`: covering indexes for the new permission foreign keys.
- `20260914041917_permission_engine_v2_dual_enforcement`: capability-aware jury roster and feature-rollout paths, including global-scope protection across existing and requested rollout scopes.
- `20260914140500_permission_engine_v2_strict_dual_guards`: authoritative table guards for edition lifecycle, Incident Command and Feature Rollout. Each accepted authenticated write records a server-side comparison event and requires legacy Organizer plus capability approval.
- `20260918192636_permission_engine_v2_storage_rls_cutover`: storage policies moved to capability/ownership authorization.
- `20260918192719_permission_engine_v2_public_legacy_rls_cutover`: remaining public-schema legacy RLS migrated.
- `20260918192731_permission_engine_v2_televoting_rls_cutover`: raw Televoting legacy RLS migrated.
- `20260918192743_permission_engine_v2_rulebook_capability_cutover`: Rulebook Organizer helper retired in favor of rules capabilities.
- `20260918195000_permission_engine_v2_authoritative_cutover`: final capability-only authorization, read-only legacy role history and global authoritative rollout.
- Organizer route shadow probes cover the shared shell, including the specialist Confirmations and Televoting admin families. The access simulation explains domains, routes and actions without impersonation.
- Access & Permissions exposes an explicit Readiness view. Zero observations remain a waiting state rather than being presented as a successful zero-mismatch result.

The final authoritative batch removes the remaining compatibility fallbacks, keeps the Integrity helper name as a capability-backed compatibility boundary, enables `permission_engine_v2` globally, and leaves route telemetry active for audit.
