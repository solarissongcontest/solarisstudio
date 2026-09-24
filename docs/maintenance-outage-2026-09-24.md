# Solaris Studio emergency maintenance mode — 24 September 2026

Solaris Studio is intentionally placed behind a server-level maintenance response while the production database service is restricted.

## Public behavior

- Every normal GET/HEAD route returns the branded maintenance page with HTTP 503.
- All non-GET requests return HTTP 503 JSON and are not forwarded to Solaris Studio application services.
- The page states an expected return date of **10 October 2026**.
- The page states that **all deadlines scheduled during the outage will be postponed** and that updated deadlines will be published after service restoration.
- MySolaris, Confirmations, Televoting and Organizer are included in the outage rather than being left in a partially working state.

## Why this is server-level

The request is intercepted before normal Solaris Studio routing, Supabase-backed page rendering and application server functions. This prevents users from seeing partial data or repeating writes while database service is unavailable.

## Restore procedure

1. Confirm production Supabase data reads and writes are healthy.
2. Set `GLOBAL_MAINTENANCE_MODE` in `src/lib/maintenance.ts` to `false`.
3. Run Quality, Browser audit and the Rules + Integrity migration rehearsal.
4. Deploy.
5. Publish replacement deadlines before reopening any affected timed process.
6. Keep the maintenance page files for one release as rollback insurance, then remove them in normal cleanup.

Do not silently restore original deadlines that elapsed during the outage.
