# Public V3 P42 Account implementation state

Branch: `v3/public-account-parity`

Canonical P42 sections:

- Security — implemented using the existing protected recovery-email and password mutation engines.
- Devices & sessions — implemented against the caller-bound System contract from `20261016163000_v3_account_session_management.sql` and its hardening migration: `public.v3_my_sessions()` for projection plus `public.v3_revoke_session(text, uuid, text)` for non-current-session revocation.
- Privacy — implemented using the existing RLS-protected `fan_profiles` projection/mutation (`private | unlisted | public`, leaderboard opt-in).
- Access — implemented from the existing MySolaris delegation/access context; no browser-owned role truth.
- Account actions — current-session sign-out waits for canonical auth sign-out and fails visibly if revocation cannot be confirmed.

The route remains reversible: legacy content is retained and V3 P42 content is selected only after the server rollout gate enables Account/Settings V3.

## Devices & sessions reliability

The Public client consumes only the privacy-safe System projection. It does not infer session state from cookies, local storage, `navigator.userAgent`, IP data or browser-local device records.

Revocation preserves one operation id and idempotency key across fresh-auth retry. A successful or replayed command is followed by projection invalidation. An ambiguous failure is reconciled by re-reading `v3_my_sessions()` before the UI claims failure or success. The current session remains on the canonical account sign-out path and is never sent to the non-current-session revocation RPC.

The projection parser fails closed if session handles are malformed or the server does not identify exactly one current session. Raw Auth session ids, refresh/access tokens, raw user agents and IP addresses are not accepted into the client projection.

## Deployment gate

Repository implementation and System migrations are present, but hosted production was verified on 2026-10-17 to still be at migration `20261014020000`; `v3_my_sessions()` and `v3_revoke_session(text, uuid, text)` were absent there.

Until production has the System migration chain, the UI deliberately renders the explicit `unavailable` state and this PR must remain draft / unmerged if `main` auto-deploys the V3 Account slice.

Keep `country-account` at `building` until hosted migration parity, exact-head Quality + Browser Audit, and authenticated integration evidence all pass. Do not promote to `parity`, `cutover` or `retired` from repository code alone.
