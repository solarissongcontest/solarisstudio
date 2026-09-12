# Studio 2 Phase 11 — Host Management

Phase 11 turns the existing Hosting page into an audited host-selection and delivery control plane.

## Canonical boundaries

- `editions.host_country_id` and `editions.host_city` remain the canonical public edition host location.
- `shows.host_country_id` and `shows.host_city` remain the canonical per-show host overrides for split-host editions.
- `studio2_host_bids` stores candidate bid data, not a second public host truth.
- Host evaluation scores are advisory evidence only. They never select or reject a bid automatically.

## Lifecycle

`draft → submitted → eligible → shortlisted → selected`

Alternative terminal paths are `rejected` and `withdrawn`. When a later eligible bid replaces an existing selected host, the previous selected bid becomes `superseded` and remains in history.

## Authorization

- `host.read` allows access to the internal host-management snapshot.
- `host.manage` allows host-management mutations.
- Existing organizers retain compatibility access.
- `edition.manage` is accepted as a management fallback for existing delegated administration workflows.

## Safety contracts

Every mutation:

- requires an audit reason of at least five characters;
- runs through a SECURITY DEFINER RPC with server-side authorization;
- is serialized per edition with an advisory transaction lock;
- uses bid or operations revisions for stale-write protection;
- accepts a caller execution UUID for idempotent retries;
- writes an immutable `studio2_host_operation_executions` receipt;
- emits a canonical `studio2_contest_events` event using `rule.changed` with `changeKind = host.<action>`.

Direct browser access to Host Management lifecycle tables is revoked.

## Organizer surfaces

`/admin/hosts` contains:

1. **Overview** — selection and readiness summary.
2. **Bids** — candidate city/venue data, transport, accommodation, production, accessibility, sustainability and supporting evidence links.
3. **Evaluation** — comparable fixed criteria with human-entered scores and comments.
4. **Selected host** — canonical host details plus explicit per-show overrides and bulk synchronization.
5. **Operations** — venue, contracts, stage access, production, accreditation, hotels, transport, security, rehearsals, press centre, accessibility and ceremonies readiness.

## Deployment gate

Do not apply `20260912171500_studio2_host_management.sql` until Quality and Browser Audit are green on the exact final PR head SHA. After migration, run a rollback-only production smoke test covering bid creation, stale revision rejection, lifecycle transition, selection, canonical edition update, show synchronization, readiness updates, execution replay, receipts and events before merge.
