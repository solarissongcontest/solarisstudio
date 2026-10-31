# Read-only country-auth recovery release unblock

Production evidence on 2026-10-31 showed that the PostgREST pre-request operational gate rejected `public.country_auth_consume_rate_limit(...)` while Solaris was in `read_only` mode. That prevented country-account sign-in from reaching password authentication and made the recovery limiter fail before `resetPasswordForEmail(...)` could execute.

This change deliberately does **not** relax the global read-only contract. It adds one exact operational-gate exception for the service-role-only authentication protection RPC while preserving the limiter's private hashed counter storage and existing grants. Unrelated mutation RPCs and table writes remain blocked in `read_only` and `maintenance`.

The country-auth recovery error path also no longer returns a fake generic success when rate-limit infrastructure itself is unavailable. Infrastructure failure returns a generic HTTP 503 before account resolution, preserving anti-enumeration without implying that an email was sent.

Verification is intentionally local/disposable:

- exact limiter privilege and gate behavior in `read_only` and `maintenance`;
- valid/invalid country sign-in plus limiter exhaustion in `read_only`;
- recovery limiter infrastructure failure and exhaustion contracts;
- the existing Mailpit recovery/session/password replacement cycle wrapped in `read_only`;
- both clean migration replay and current-main upgrade paths.

No production recovery automation is part of these rehearsals.
