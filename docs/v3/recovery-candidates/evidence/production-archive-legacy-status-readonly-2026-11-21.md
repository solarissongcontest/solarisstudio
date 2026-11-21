# S14 Archive legacy-status repair impact: read-only preflight (21 November 2026)

Production Solaris Studio Supabase project `dkxmnvekiopyesuzggeu`, PostgreSQL 17.11, queried with bounded **READ ONLY** catalog and aggregate SQL. **No edition IDs, rows, secrets, voting records or protected backup materials were exported.**

| Observed item | Aggregate |
| --- | ---: |
| Canonical `public.studio2_edition_runtime` with `state='archived'` | **3** |
| Canonical archived runtime whose `public.editions.status` is *not* `archived` | **3** |
| Existing legacy `public.editions.status='archived'` | **0** |
| Other canonical edition runtime rows | **17** |
| New governed `public.studio2_transition_edition_v3(...)` RPC | Absent |

The historical `20261020130000_v3_s14_archive_invariant_forward_fixes.sql`, embedded unchanged in the ten-stage residual candidate, intentionally synchronizes the legacy `public.editions.status` compatibility projection from the canonical archived runtime. **Executing the residual Archive SQL on the current production data would UPDATE three real legacy edition rows** (subject to concurrent changes and its final trigger guards). This is not a purely DDL/catalog operation.

The source-stage commit and current helper contracts must be vetted on the private-backup restored PostgreSQL 17.11 owner/ACL baseline with a before/after row fingerprint and exact affected-row verification. CI synthetic fixtures do not substitute for this proof. No live compatibility backfill has been run. Never declare `archived` only because a legacy row says so; canonical runtime and immutable Results publication must remain authoritative.

Previous read-only evaluation of the revised ten-stage Archive *catalog preflight* passed (existing Final Results readiness full function body, S13 semantic contracts, Task service permissions, helper/column requirements, absence of core Archive gates). **A passing catalog preflight does not authorize the three-row data update or the ten-stage mutation-authority cutover.**

No S14 Archive residual effects are yet installed in production. The database migration history remains 497 records with unmodified historical frontier.
