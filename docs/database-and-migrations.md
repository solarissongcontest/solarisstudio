# Database and migration contract

- Production schema changes are made through new files in `supabase/migrations/`.
- Never rewrite an applied production migration.
- Destructive cleanup requires reference tracing, row counts, dependency inspection, RLS review and an explicit archival decision.
- Unknown legacy objects are retained until their consumers are understood.
- Browser writes stay behind RLS or bounded RPCs.
- Security-definer functions must use explicit privilege grants, a fixed search path and authoritative capability checks when privileged.
- Feature flags are not enabled before the corresponding deployed surface and migration are verified.

After DDL changes:

1. run migration rehearsal;
2. run Quality CI;
3. review Supabase security advisors;
4. review Supabase performance advisors;
5. production-smoke the affected paths.
