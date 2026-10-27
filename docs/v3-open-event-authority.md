# Remaining event authority boundaries

The starting inventory is 11 hard / 41 conditional / 58 debt / 1 obsolete,
111 total. This table records implementation boundaries, not acceptance or a
risk demotion. `edition.transitioned` retains its separate accepted synchronous
contract. Results internals remain owned by PR #1400.

| Event | Canonical state / command | Critical contract and event role | Required consumer / remaining gap | Risk |
| --- | --- | --- | --- | --- |
| account.changed | Account/profile state; no single proven `account.update` command | Actor-owned account mutation and audit; settings/preferences are not a new account authority | No proven canonical account command/event boundary; identify and govern all profile/security writers before accepting projections | Hard |
| identity.authenticated | Supabase Auth identity + active `auth.sessions` session; sign-in/restore followed by server `getUser` at protected boundaries | Authentication authority is synchronous canonical Auth/session state. The lifecycle label may describe telemetry/audit but may not grant access or resurrect identity. | Protected route, Organizer, server and Edge boundaries verify Auth identity; Data API and authenticated Storage authority require a live canonical session. Remaining application-event/audit delivery is optional observational maturity. | Debt |
| identity.signed_out | Supabase Auth global sign-out + active-session boundary | Canonical sign-out/session invalidation removes server authority without waiting for an event consumer; local private-cache cleanup is a derived presentation consequence. | Data API rejects inactive sessions; authenticated Storage reuses the same `auth.sessions` guard; Edge/server identity uses Auth `getUser`; explicit sign-out fences the current tab cache after successful Auth sign-out. | Debt |
| session.changed | `auth.sessions`, `auth.refresh_tokens`; managed Auth refresh | Signed session ownership, expiry and refresh-token lifecycle are authoritative | Refresh/session-change provenance and all authorization boundaries remain unproven; do not fabricate an application event consumer as authority | Hard |
| session.revoked | `auth.sessions` + `studio2_account_session_revocations`; `v3_revoke_session` | Actor-scoped noncurrent target, fresh auth, synchronous delete/tombstone/operation completion; no consumer may keep access alive | New shared Data API guard checks live session before operational-mode early returns; real HTTP proof pending; managed Auth, Edge/Storage and persisted event coverage remain | Hard |
| edition.changed | `editions` and `studio2_edition_runtime`; transition RPC covers lifecycle only | Versioned transition does not prove all edition metadata writers | Direct application edition writers remain in S16; define mutation authority/CAS/audit for metadata before calling its projections derived | Hard |
| show.changed | `shows`; multiple existing administrative writers | Scoped commands, version/CAS, audit and official state must share a transaction | Direct application writers remain; a correct publication boundary does not establish show metadata/lineup authority | Hard |
| show.cue_changed | `shows.broadcast_config.studio2Rundown`; `studio2_transition_broadcast_segment` | Row lock, expected revision, legal transitions, single live segment, synchronous state + contest audit | Canonical cue RPC exists, but other show writers and missing operation/domain-event boundary prevent accepting the entire cue consequence contract | Hard |
| integrity.case_changed | `integrity_cases` + `integrity_case_events`; `admin_update_integrity_case_status` | Synchronous status + history, governed access, legal transition policy and immutable evidence | Existing enum validation is not a proven transition graph; canonical operation/event provenance and complete writer inventory remain | Hard |
| integrity.appeal_changed | `integrity_case_appeals`, sanctions, events; `admin_decide_integrity_appeal` | Locked undecided appeal, assigned independent reviewer, rationale, valid sanction replacement and synchronous history | Preserve existing reviewer/evidence protections; prove the complete governed operation/event/reconciliation boundary and catalog writers | Hard |
| media.verified | `studio2_upload_authorizations` + final Storage object; `solaris-upload-finalize` | Actor + secret, byte/type checks, exact destination readback on duplicate, confirmed conditional receipt write | Two false-success/recovery defects fixed; service-role direct writer still fails S16 and there is no proven transactional domain-event/operation boundary across Storage and database | Hard |

## Executable evidence

- `src/lib/v3-open-event-authority.contract.test.ts` preserves the remaining
  integrity-critical identities and explicitly keeps the two identity lifecycle
  labels non-authoritative.
- `src/lib/v3-identity-lifecycle-authority.contract.test.ts` proves the shared
  server/Edge identity checks, authenticated Storage live-session boundary and
  explicit sign-out cache fence.
- `src/lib/v3-data-api-session-guard.contract.test.ts` and the extended
  `.github/scripts/v3-account-session-management-rehearsal.sh` cover the shared
  Data API revocation boundary. Contract tests are not a substitute for the HTTP rehearsal.
- `src/lib/v3-media-finalizer-recovery.test.ts` executes the actual finalizer with
  failed/raced receipt writes and equal, unequal, wrong-size or unavailable
  duplicate-object readback. It does not certify a database/Storage transaction.
- `src/lib/v3-s16-media-session-authority.test.ts` scans the real media writer and
  keeps unknown critical authority hard; no new writer allowlist is introduced.

The local Supabase bootstrap failed extracting `supabase/postgres:17.6.1.158`
with `no space left on device`. No stateful local catalog or full-contest proof
was produced by that attempt. Isolated GitHub rehearsal results must be checked
at the exact candidate SHA before accepting the new migration.
