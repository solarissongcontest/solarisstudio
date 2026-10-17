# SYSTEM CONTRACT RESOLVED — P42 Account devices & sessions

## Capability ID

`country-account` / `public.account-session-settings` — Public V3 P2 + P42, Me → Account → Devices & sessions.

## Canonical invariant

Session truth and revocation are server-owned. Browser cookies, local storage, user-agent heuristics and UI-local device lists are not authority. The client must never receive refresh/access tokens belonging to any session.

## Supplied System contract

The repository System migration chain now supplies:

- `public.v3_my_sessions()` — authenticated, caller-bound privacy-safe session projection.
- `public.v3_revoke_session(text, uuid, text)` — authenticated non-current-session revocation with operation receipts, idempotency, active-session enforcement and fresh-auth assurance.
- `private.v3_require_active_auth_session()` — validates the signed `session_id` claim against `auth.sessions` for security-sensitive endpoints.
- `private.studio2_require_fresh_auth(integer)` — R3 freshness boundary using signed AMR evidence rather than token refresh.

The projection returns opaque SHA-256 session handles, current-session marking, minute-rounded created/last-active timestamps, expiry, coarse device/browser labels, AAL/fresh-auth assurance for the current session, recent privacy-safe revocation history and server time. It does not return raw Auth session ids, raw user agents, IP addresses, access tokens or refresh tokens.

## Command semantics

The revocation command:

- derives the user exclusively from `auth.uid()` and the active signed auth session;
- refuses the current session and directs that case to canonical sign-out;
- accepts only an opaque session handle plus operation/idempotency identity;
- cannot be used to probe another user's sessions;
- requires fresh signed authentication evidence for a new revocation;
- allows exact successful retries to reconcile without demanding another fresh-auth prompt;
- writes a revocation tombstone and operation receipt;
- removes the target `auth.sessions` row server-side;
- remains available for security recovery in read-only / maintenance modes.

## Public integration

The V3 Account client now:

1. reads `v3_my_sessions()` with no caller-selected user id;
2. validates every opaque handle and requires exactly one server-marked current session;
3. displays coarse server device/browser labels and approximate last activity;
4. creates one operation id + idempotency key when a user chooses a non-current session to revoke;
5. preserves that exact operation identity across fresh-auth retry;
6. uses current-password reauthentication through the canonical Supabase Auth client when System requires fresh authentication;
7. retries the same reviewed revocation operation;
8. reconciles ambiguous failures by re-reading `v3_my_sessions()` before claiming an outcome;
9. keeps current-device logout on the canonical account sign-out path;
10. fails closed to an explicit unavailable/error state rather than inventing browser-local session truth.

## Remaining deployment gate

The contract is resolved in the repository, but hosted production was checked on 2026-10-17 and still reported migration `20261014020000`; both public session RPCs were absent. Therefore repository integration must remain deployment-gated until the System migration chain is applied and authenticated production verification passes.

## Release evidence still required

1. hosted migration includes the P42 session migrations and hardening;
2. unauthenticated session listing remains denied;
3. viewer A cannot list or revoke viewer B sessions;
4. current device is marked deterministically;
5. no tokens, raw Auth session ids or raw IP/high-precision location leak;
6. revoke non-current session invalidates it server-side;
7. replay of the same revocation is idempotent;
8. ambiguous result reconciles correctly on read;
9. fresh-auth requirement is enforced server-side;
10. revoked session loses authenticated access;
11. projection ordering remains deterministic;
12. exact-head Public Quality and Browser Audit pass.
