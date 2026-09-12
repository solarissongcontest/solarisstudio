## Studio 2 Phase 11 — Host Management

Replaces the old direct-table Hosting screen with an audited organizer control plane for host bids, evaluation, canonical selection and delivery readiness while preserving the existing edition/show host fields as the public source of truth.

### Host domain
- candidate host bids with country, city, venue, capacity, address, airport/transport, accommodation, production, broadcaster, timezone, coordinates, accessibility, sustainability and evidence links
- controlled lifecycle: draft → submitted → eligible → shortlisted → selected, plus rejected / withdrawn / superseded history
- one-selected-host-per-edition invariant
- fixed evaluation criteria with organizer scores/comments
- selected-host operational readiness across 12 delivery areas

### Canonical integration
- selecting a host updates `editions.host_country_id` and `editions.host_city`
- existing `shows.host_country_id` and `shows.host_city` remain canonical split-host overrides
- bulk show synchronization is explicit and confirmed rather than automatic
- no second public host truth

### Safety / authorization
- new `host.read` and `host.manage` capabilities
- organizer and edition-management compatibility fallback
- server-side authorization
- per-edition advisory locking
- bid/operations revision checks for stale writes
- caller execution UUID idempotency
- required audit reason
- immutable host operation receipts
- canonical Studio 2 contest events
- direct browser access to host lifecycle tables revoked

### Organizer UI
`/admin/hosts` now has:
- Overview
- Bids
- Evaluation comparison matrix
- Selected Host + show-level assignments
- Operations readiness

Host Management is promoted into the current-edition navigation.

### Tests
Adds unit and architecture coverage for lifecycle actions, readiness math, one-host invariants, no score-driven auto-selection, capability contracts, RPC-only mutation boundaries, canonical host integration, idempotency and audit/event behavior.

### Deployment gate
Do not apply `20260912171500_studio2_host_management.sql` until **Quality and Browser Audit are green on the exact final PR head SHA**. After migration, run a rollback-only production smoke test before merge.
