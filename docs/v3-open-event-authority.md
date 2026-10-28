# Remaining event authority boundaries

The starting inventory for this burn-down was 11 hard / 41 conditional / 58 debt / 1 obsolete,
111 total. `edition.changed` is no longer part of the hard set on this branch: its canonical
mutation authority is now governed and the event is explicitly a derived invalidation/audit
consequence. The remaining derived-consumer maturity stays visible as tracked debt rather than
being deleted from the inventory. `edition.transitioned` retains its separate accepted synchronous
contract. Results internals remain owned by PR #1400.

| Event | Canonical state / command | Critical contract and event role | Required consumer / remaining gap | Risk |
| --- | --- | --- | --- | --- |
| account.changed | Account/profile state; no single proven `account.update` command | Actor-owned account mutation and audit; settings/preferences are not a new account authority | No proven canonical account command/event boundary; identify and govern all profile/security writers before accepting projections | Hard |
| identity.authenticated | Supabase Auth identity/session; Auth sign-in + server `getUser` | Signed identity must match the active user/session; UI/cache is derived | Prove lifecycle audit/event provenance and live-session checks across server/Edge/Storage boundaries; cache isolation alone does not prove authorization | Hard |
| identity.signed_out | Supabase Auth; `signOutSolarisAccount` -> Auth sign-out | Auth session removal must deny subsequent authorization without delivery | New Data API hook covers ordinary requests; real HTTP rehearsal pending; remaining server/Edge/Storage authorization requires proof | Hard |
| session.changed | `auth.sessions`, `auth.refresh_tokens`; managed Auth refresh | Signed session ownership, expiry and refresh-token lifecycle are authoritative | Refresh/session-change provenance and all authorization boundaries remain unproven; do not fabricate an application event consumer as authority | Hard |
| session.revoked | `auth.sessions` + `studio2_account_session_revocations`; `v3_revoke_session` | Actor-scoped noncurrent target, fresh auth, synchronous delete/tombstone/operation completion; no consumer may keep access alive | New shared Data API guard checks live session before operational-mode early returns; real HTTP proof pending; managed Auth, Edge/Storage and persisted event coverage remain | Hard |
| edition.changed | `public.editions`; `v3_create_edition`, metadata/editing/theme/visual commands | Edition-owned writes authenticate, scope `edition.manage`, lock/CAS where concurrency matters, persist audit + compact `edition.changed`, complete/read back an operation receipt, and API roles have no raw edition DML | No async consumer owns edition truth. Optional realtime/dashboard/analytics invalidation may mature later by re-reading canonical state. Host, lifecycle, Confirmation-round consequences and show publication remain separate sanctioned semantic operations rather than duplicate `edition.changed` writers. | Tracked debt (derived consequence only) |
| show.changed | `shows`; multiple existing administrative writers | Scoped commands, version/CAS, audit and official state must share a transaction | Direct application writers remain; a correct publication boundary does not establish show metadata/lineup authority | Hard |
| show.cue_changed | `shows.broadcast_config.studio2Rundown`; `studio2_transition_broadcast_segment` | Row lock, expected revision, legal transitions, single live segment, synchronous state + contest audit | Canonical cue RPC exists, but other show writers and missing operation/domain-event boundary prevent accepting the entire cue consequence contract | Hard |
| integrity.case_changed | `integrity_cases` + `integrity_case_events`; `admin_update_integrity_case_status` | Synchronous status + history, governed access, legal transition policy and immutable evidence | Existing enum validation is not a proven transition graph; canonical operation/event provenance and complete writer inventory remain | Hard |
| integrity.appeal_changed | `integrity_case_appeals`, sanctions, events; `admin_decide_integrity_appeal` | Locked undecided appeal, assigned independent reviewer, rationale, valid sanction replacement and synchronous history | Preserve existing reviewer/evidence protections; prove the complete governed operation/event/reconciliation boundary and catalog writers | Hard |
| media.verified | `studio2_upload_authorizations` + final Storage object; `solaris-upload-finalize` | Actor + secret, byte/type checks, exact destination readback on duplicate, confirmed conditional receipt write | Two false-success/recovery defects fixed; service-role direct writer still fails S16 and there is no proven transactional domain-event/operation boundary across Storage and database | Hard |

## Edition authority evidence

`edition.changed` moved out of the hard set because the writer defect was removed rather than
reclassified away:

- Organizer edition creation uses `v3_create_edition`; direct browser insert/delete/update of
  `public.editions` was removed.
- Edition-owned metadata (`name`, `description`, historical `event_date`/`year`) uses a row-locked
  `data_revision` compare-and-swap command.
- Global Confirmation editing uses a reviewed expected-state command; Confirmation round
  create/update/status/editing/delete uses its existing canonical preview/apply operation instead
  of the legacy service-role RPCs.
- Edition visual fields retain their scoped CAS command; default theme attachment has its own
  expected-theme CAS command.
- Lifecycle remains owned by `studio2_transition_edition_v3`; Archive remains a lifecycle
  consequence. Host selection remains owned by the existing governed host operation. Show
  publication owns the compatibility `editions.published/status` projection.
- Legacy edition/Confirmation round writers are fail-closed tombstones and their EXECUTE grants
  are revoked.
- `anon`, `authenticated` and `service_role` lose raw `INSERT/UPDATE/DELETE/TRUNCATE` on
  `public.editions`; required trigger consequences execute only through hardened, non-callable
  internal functions.
- `edition.changed` carries identifiers, change kind, changed field names and canonical revision,
  not arbitrary Organizer blobs. A failed event insert aborts its command transaction; later
  consumer failure cannot become a competing edition authority.

Executable evidence lives in `src/lib/v3-edition-authority.contract.test.ts` and
`.github/tests/v3-edition-authority.sql`. S16 still reports independent `public.shows` findings
until the show/cue lane completes its own writer consolidation; those findings must not be
mistaken for an unresolved `public.editions` writer.

## Other executable evidence

- `src/lib/v3-open-event-authority.contract.test.ts` preserves the remaining hard identities and
  verifies the separate derived classification for `edition.changed`.
- `src/lib/v3-data-api-session-guard.contract.test.ts` and the extended
  `.github/scripts/v3-account-session-management-rehearsal.sh` cover the revocation boundary.
  Contract tests are not a substitute for the HTTP rehearsal.
- `src/lib/v3-media-finalizer-recovery.test.ts` executes the actual finalizer with failed/raced
  receipt writes and equal, unequal, wrong-size or unavailable duplicate-object readback. It does
  not certify a database/Storage transaction.
- `src/lib/v3-s16-media-session-authority.test.ts` scans the real media writer and keeps unknown
  critical authority hard; no new writer allowlist is introduced.

All stateful edition-authority rehearsal remains local/disposable. Hosted production may be used
only for bounded read-only catalog inspection; automated browser/CI/rehearsal traffic must never
use production Supabase.
