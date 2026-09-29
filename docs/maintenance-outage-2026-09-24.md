# Solaris Studio emergency maintenance mode — 24 September 2026

Solaris Studio is intentionally placed behind a server-level maintenance response while the production database service is restricted.

## Public behavior

- Every normal GET/HEAD route returns the branded maintenance page with HTTP 503.
- All non-GET requests return HTTP 503 JSON and are not forwarded to Solaris Studio application services.
- The page states an expected return date of **10 October 2026**.
- The page states that **all deadlines scheduled during the outage will be postponed** and that updated deadlines will be published after service restoration.
- MySolaris, Confirmations, Televoting and Organizer are included in the outage rather than being left in a partially working state.
- A separate Worker-level maintenance access gate is available at `/__maintenance-admin` for trusted administrators. It is deliberately independent of Supabase so it still works while Supabase Auth/database access is service-restricted.

## Why this is server-level

The request is intercepted before normal Solaris Studio routing, Supabase-backed page rendering and application server functions. This prevents users from seeing partial data or repeating writes while database service is unavailable.

## Administrator maintenance bypass

The temporary administrator bypass does **not** use Solaris/Supabase authentication. Cloudflare must provide a server-only `MAINTENANCE_ADMIN_SECRET` secret. The real value must never be committed or exposed through a `VITE_*` variable.

1. Open `/__maintenance-admin`.
2. Enter the maintenance access secret.
3. The Worker verifies the secret before the application is invoked.
4. A short-lived signed `HttpOnly; Secure; SameSite=Strict` cookie is set for that browser.
5. Subsequent requests with a valid signed cookie bypass only the maintenance response and are allowed through to the normal application.
6. The bypass does not create a Solaris account session, assign an Organizer role or weaken normal application authorization.
7. Open `/__maintenance-admin/logout` to clear the bypass cookie early.

Because the production database is still restricted during this outage, bypassing the maintenance page does not make unavailable Supabase-backed data or writes magically healthy. It only allows a trusted browser to inspect whatever parts of the normal application can still render.

## Restore procedure

1. Confirm production Supabase data reads and writes are healthy.
2. Set `GLOBAL_MAINTENANCE_MODE` in `src/lib/maintenance.ts` to `false`.
3. Run Quality, Browser audit and the Rules + Integrity migration rehearsal.
4. Deploy.
5. Publish replacement deadlines before reopening any affected timed process.
6. Keep the maintenance page files for one release as rollback insurance, then remove them in normal cleanup.

Do not silently restore original deadlines that elapsed during the outage.
