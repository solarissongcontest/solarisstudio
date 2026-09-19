# Permission Engine v2 authorization inventory

Status: **authoritative**.

Permission Engine v2 is the authorization source for Solaris Studio. Active access is derived from `studio2_role_assignments`, `studio2_role_capabilities` and `studio2_capability_grants`. Legacy `user_roles` rows are read-only rollback/history data and are not a runtime authorization source.

## Decision model

- Global role assignments and direct grants apply to every edition.
- Edition-scoped assignments and grants apply only when that edition is the request context.
- Expired assignments and grants never evaluate as active.
- Server code, browser gates and database RLS use the same v2 role/capability model.
- Organizer access requires an active global `organizer` or `superadmin` v2 assignment where an Organizer-wide gate is appropriate.
- Narrower operations use their named capability instead of treating Organizer as a universal boolean.
- Protected mutations execute through RLS or guarded `SECURITY DEFINER` RPCs with fixed search paths and explicit execute grants.
- Country ownership, publication state, workflow state, result verification, incident lifecycle and rulebook validation remain independent safeguards. A capability never bypasses those domain constraints.
- “View access as” is a read-only projection. It never changes the session, JWT, request context or RLS identity.
- Route evaluations remain recorded for audit and troubleshooting. The historical RPC name `studio2_check_capability_shadow` is retained for compatibility, but it records the same authoritative capability decision in both legacy/capability fields and returns mode `authoritative`.

## Capability domains

| Domain | Representative capabilities | Current enforcement |
| --- | --- | --- |
| Editions | `edition.read`, `edition.manage`, `edition.transition`, `edition.archive` | Authoritative capability plus lifecycle safeguards |
| Delegations | `delegation.read`, `delegation.manage` | Capability plus owned-country rules where applicable |
| Confirmations | `confirmation.read`, `confirmation.manage` | Capability plus confirmation workflow state |
| Entries | `entry.read_private`, `entry.edit`, `entry.approve`, `entry.publish` | Capability plus ownership/publication safeguards |
| Voting | `voting.read`, `voting.manage` | Authoritative capability |
| Jury | `jury.ballots.read`, `jury.ballots.manage` | Authoritative capability plus jury workflow rules |
| Televote | `televote.ballots.read`, `televote.ballots.manage` | Authoritative capability plus voting integrity rules |
| Results | `results.preview`, `results.verify`, `results.publish` | Capability plus version/review/publication state |
| Incidents | `incident.read`, `incident.manage`, `incident.resolve` | Capability plus incident lifecycle |
| Communications | `communications.read`, `communications.send`, `communications.manage` | Capability plus audience/publication state |
| Rules | `rules.read`, `rules.edit`, `rules.publish` | Capability plus rulebook validation/governance |
| Integrity | `integrity.read`, `integrity.manage`, `integrity.sanction` | Capability plus evidence/appeal safeguards |
| Publishing | `publishing.read`, `publishing.manage`, `publishing.publish` | Capability plus canonical publication state |
| Broadcast | `broadcast.read`, `broadcast.control`, `broadcast.manage` | Authoritative capability |
| Rollout | `rollout.read`, `rollout.manage` | Capability plus rollout dependency engine |
| Permissions | `permissions.read`, `permissions.manage`, `permissions.audit` | Authoritative global capability |
| Governance | `governance.vote` | Authoritative capability |
| Host | `host.read`, `host.manage` | Capability plus host workflow state |
| Storytelling | `story.read`, `story.manage` | Authoritative capability |

## Presets

| Preset | Intended use |
| --- | --- |
| Superadmin | Emergency platform administration; full catalog |
| Organizer | General contest administration; full Organizer capability preset |
| Results Manager | Voting review and results release without permission administration |
| Integrity Officer | Investigations, evidence, sanctions and rule context |
| Broadcast Operator | Rundown/live cue operation without publication authority |
| HOD | Delegation, entry, communications and voting work, normally edition-scoped |
| Viewer | Read-only operational visibility |

Direct grants are for deliberate exceptions, not a replacement for sensible role presets.

## Legacy debt

The migration began with direct legacy Organizer predicates spread across RLS, helper functions and storage policies. The completed cutover now enforces these invariants:

1. Every live legacy Organizer has an active global v2 Organizer or Superadmin assignment.
2. Application RLS contains zero direct `has_role` predicates.
3. Live authorization helpers contain zero direct `public.has_role` fallbacks.
4. `user_roles` has no browser-write policies and is retained only as historical rollback data.
5. Orphaned legacy role rows are removed.
6. `permission_engine_v2` is enabled globally with no user- or edition-scoped rollout restriction.
7. Browser and server runtime gates no longer query `user_roles` for authorization.

## Telemetry

New route telemetry is authoritative. Because the compatibility RPC keeps its historical response fields, current events store the same capability decision in both `legacy_allowed` and `capability_allowed`. Any older mismatches inside the audit retention window are **pre-cutover historical evidence**, not a current disagreement between two active authorization engines.

The Access & Permissions page therefore treats those older mismatches as audit history rather than a blocker to current access.

## Completed migration batches

- `20260914035152_permission_engine_v2_foundation`: capability catalog, presets, assignments, grants, telemetry and guarded administration RPCs.
- `20260914035308_permission_engine_v2_fk_indexes`: covering indexes for permission-engine foreign keys.
- `20260914041917_permission_engine_v2_dual_enforcement`: early capability-aware enforcement during rollout.
- `20260914140500_permission_engine_v2_strict_dual_guards`: transitional high-risk guards.
- `20260918192636_permission_engine_v2_storage_rls_cutover`: storage authorization migrated.
- `20260918192719_permission_engine_v2_public_legacy_rls_cutover`: remaining public-schema legacy RLS migrated.
- `20260918192731_permission_engine_v2_televoting_rls_cutover`: Televoting legacy RLS migrated.
- `20260918192743_permission_engine_v2_rulebook_capability_cutover`: Rulebook helper migrated.
- `20260918205750_permission_engine_v2_authoritative_cutover`: capability-only database authorization, read-only legacy role history and global authoritative rollout.
- Runtime completion merged after the database cutover: Organizer/browser/server/Confirmations/Televoting support paths use v2 assignments and capabilities rather than `user_roles`.

## Current security boundaries

The final hardening keeps intentional public/authenticated RPCs available while removing direct execution from trigger bodies and nested privileged helpers.

- Anonymous `SECURITY DEFINER` access is constrained by an explicit reviewed allowlist in migration rehearsal.
- Trigger-only functions have no direct API execution grant.
- Nested privileged helpers are service-role only when direct service execution is required.
- RLS-enabled internal tables with no policy are intentionally fail-closed and accessed through guarded RPC/service paths.
- The standalone Televoting administration path uses the signed-in user's Solaris JWT plus RLS/capabilities; it does not require a browser-visible or Cloudflare Televoting service-role credential.

## Production acceptance snapshot — 19 September 2026

Verified in production after the authoritative rollout and final hygiene work:

- 3 live legacy Organizers; 3 active v2 Organizer/Superadmin assignments; 0 missing.
- 0 direct legacy-role RLS policies.
- 0 live authorization-function dependencies on `public.has_role`.
- 0 writable `user_roles` policies.
- 0 orphan legacy role rows.
- `permission_engine_v2` enabled globally.
- 24/24 country themes on Country/Wiki Design v2.
- Production migration staging schema removed.
- Final RLS/schema hygiene: `20260919085854_final_rls_schema_hygiene`.
- Final internal SECURITY DEFINER hardening: `20260919092023_security_definer_internal_helper_hardening`.

The remaining Supabase Auth “leaked password protection” advisor warning is a project-level Auth setting, not a database migration. It must be enabled in Supabase Auth settings or through a Management API credential with permission to change project Auth configuration.
