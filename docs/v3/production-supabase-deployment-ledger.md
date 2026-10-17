# Solaris Studio V3 production Supabase deployment ledger

This ledger records production database synchronization evidence. It must never contain credentials, database passwords, access tokens, service-role keys, or user data.

## 2026-10-17 Confirmation-maintenance refresh

- Production-state inspection source main SHA: `96ccdfbfcc63b6b61d6e233f008cef3c4b44204c`
- Production deployment operator source main SHA: `bc663383be1da372ef74e2b1efc1c07a48989dd6`
- Production project ref: `dkxmnvekiopyesuzggeu`
- Production project name: `Solaris Studio`
- Production migration head before deployment: `20261014020000_v3_me_cutover`
- Production migration head after deployment: `20261017143200_confirmation_maintenance_read_authority`
- Repository migration head: `20261017143200_confirmation_maintenance_read_authority`
- Canonical production lag after deployment: **0 migrations**
- Canonical migrations applied by this refresh: **55**
- Production database deployment completed: `2026-10-17T18:22:55Z` UTC

### Why the connected migration action is not used for this backlog

The connected Supabase migration action generates its own migration version rather than preserving the repository timestamps. Applying the Confirmation hotfix migrations through that path would make `supabase_migrations.schema_migrations` diverge further from version control and would cause the canonical CLI deployment to attempt the repository migrations again later. This deployment lane therefore preserves history and uses `supabase db push --linked` from an explicitly approved local operator checkout.

### Confirmation production mismatch verified before deployment

Bounded read-only production inspection found the exact failure the October 17 hotfix was designed to repair:

- `studio2_country_cockpit(...)` still required mutation-level `confirmation.manage` for a read projection;
- legacy Confirmation admin reads still used old delegation/admin authorization;
- `admin_update_confirmation_controls(...)` was still the old legacy-authority implementation;
- `public_country_account_confirmation_dashboard()` was absent;
- production migration history stopped at `20261014020000`.

The canonical migration deployment below removed that backend blocker and brought production to `20261017143200`.

### Production migration-history shape

The October production cutover intentionally left two pre-head history representations that Supabase CLI 2.121+ reports as mismatches:

1. canonical repository migration files from before the cutover whose effects are already represented in production but whose individual timestamps are not present in the hosted history table; and
2. hosted bootstrap/cutover history timestamps that exist remotely but do not correspond to canonical repository migration files.

Neither side is evidence that the current database schema should be replayed or that production history should be rewritten. The production operator script therefore creates a temporary local compatibility view only while comparing/pushing migrations:

- local-only versions at or before `20261014020000` are temporarily held out of `supabase/migrations`;
- remote-only versions at or before `20261014020000` receive temporary no-op local timestamp aliases;
- all held files are restored and all aliases are deleted on exit;
- `--include-all`, `supabase migration repair`, and `supabase db pull` are not part of this production deployment path.

This leaves the hosted migration-history table unchanged while allowing the CLI to see only the actual post-production canonical delta.

### Canonical deployed migration chain

1. `20261014030000_v3_entry_review_binding`
2. `20261014040000_v3_entry_restore_provenance`
3. `20261014050000_v3_entry_cutover`
4. `20261014060000_v3_entry_submission_receipt`
5. `20261014132819_v3_jury_reliability_foundation`
6. `20261014133955_v3_jury_rollout_flag`
7. `20261014142000_v3_organizer_cutover`
8. `20261014153000_v3_televote_recovery_continuity`
9. `20261014194651_v3_s2_operation_receipt_idempotency`
10. `20261015040000_v3_s2_entry_correction_operation`
11. `20261015050000_v3_s3_confirmation_invariants`
12. `20261015060000_v3_s3_entry_invariants`
13. `20261015070000_v3_s3_media_invariants`
14. `20261015080000_v3_s3_jury_invariants`
15. `20261015090000_v3_s3_televote_invariants`
16. `20261015091000_v3_televote_round_entry_crypto_path`
17. `20261015155722_v3_s3_results_invariants`
18. `20261015164100_v3_s3_publication_invariants`
19. `20261015173000_v3_s3_identity_access_invariants`
20. `20261015180000_v3_s4_domain_event_outbox`
21. `20261015183000_v3_s5_confirmation_consequences`
22. `20261015183100_v3_confirmation_submit_runtime_replay_restore`
23. `20261015183200_v3_confirmation_submit_runtime_dependencies_restore`
24. `20261015201221_v3_s5_entry_consequences`
25. `20261016040000_v3_s5_jury_consequences`
26. `20261016043000_v3_s5_televote_consequences`
27. `20261016050000_v3_s5_media_review_consequences`
28. `20261016053000_v3_s5_results_consequences`
29. `20261016060000_v3_s5_publication_consequences`
30. `20261016060500_v3_s5_publication_legacy_projection_cutover`
31. `20261016062000_v3_s5_notice_consequences`
32. `20261016063000_v3_s8_confirmation_resource_limits`
33. `20261016064000_v3_s9_operation_trace`
34. `20261016064100_v3_s5_notification_consequences`
35. `20261016070000_v3_s7_entry_object_authorization`
36. `20261016071000_v3_s7_jury_vote_object_scope_v2`
37. `20261016150000_v3_s7_next_in_line_authorization`
38. `20261016153000_v3_s8_identity_set_bulk_protection`
39. `20261016160000_v3_s8_prediction_replay_protection`
40. `20261016163000_v3_account_session_management`
41. `20261016163100_v3_account_session_management_hardening`
42. `20261016193700_v3_entry_credits_contract`
43. `20261017001900_v3_s14_televote_deadline_column`
44. `20261017002000_v3_s14_televote_deadline_extension`
45. `20261017002100_v3_s14_televote_deadline_replay_fix`
46. `20261017002200_v3_s14_televote_deadline_open_compatibility`
47. `20261017002300_v3_s14_televote_round_binding_id_fix`
48. `20261017002400_v3_s14_televote_deadline_guard_compatibility`
49. `20261017100000_v3_s5_access_consequences`
50. `20261017103000_v3_s5_preference_consequences`
51. `20261017110000_v3_s5_prediction_score_consequences`
52. `20261017113000_v3_s5_prediction_round_consequences`
53. `20261017143000_confirmation_maintenance_hotfix`
54. `20261017143100_confirmation_maintenance_hod_projection`
55. `20261017143200_confirmation_maintenance_read_authority`

### Isolated upgrade and Confirmation evidence

The repository's production-head rehearsal rebuilt an isolated local Supabase stack at the exact production head `20261014020000`, restored every migration newer than that head, and upgraded through `20261017143200`.

After the remaining S5 consequence wave landed, PR #773 (`[V3-SYS] Integrate remaining S5 consequence wave on current main`) ran the aggregate production-head rehearsal on head SHA `2952fd76abf2f33440ebf243aeed0476c9aea180`. GitHub Actions run `39033572222` completed successfully and recorded the exact result:

`Production-head-equivalent upgrade passed: 20261014020000 -> 20261017143200 (55 migrations)`

That rehearsal applied the full current 55-migration post-production chain in isolated Supabase, including the notification/access/preference/prediction consequence migrations and the three Confirmation maintenance migrations.

The dedicated Confirmation maintenance rehearsal also passed the exact emergency scenario on isolated local Supabase:

1. seed one already-confirmed response with one effective requirement in a closed round;
2. verify a read-only inspector can inspect but cannot mutate;
3. reopen editing for only the existing response with exact-edition `confirmation.manage`;
4. verify the round stays closed and no requirement is duplicated;
5. verify the participant dashboard remains accepted while exposing editing open;
6. mint a country-account edit token despite the closed round;
7. edit the same canonical response and persist a song change;
8. verify response count remains one and requirement count remains one;
9. have Organizer observe the revision and close editing;
10. verify the active edit token is revoked and the HOD dashboard immediately reports editing closed.

All automated verification above used local/isolated Supabase only. It did not generate automated workflow traffic against production.

### Production deployment and bounded verification evidence

The production operator executed the guarded deployment script from exact main SHA `bc663383be1da372ef74e2b1efc1c07a48989dd6` using Supabase CLI 2.121.0. The script:

- validated the exact ordered 55-version manifest;
- completed the canonical `supabase db push --linked --dry-run` first;
- applied the same 55 migrations only after the explicit commit gate;
- verified local/remote parity through `20261017143200` after the push;
- completed at `2026-10-17T18:22:55Z` UTC.

Independent bounded production inspection after the push confirmed:

- `supabase_migrations.schema_migrations` head is `20261017143200`;
- `public_country_account_confirmation_dashboard()` exists and is not executable anonymously;
- the maintenance HOD dashboard requires an authenticated active country account;
- `public_create_country_account_edit_token(...)` requires an authenticated active country account and the response/round/edition editing gates;
- Organizer mutation remains gated by exact-edition `confirmation.manage`;
- Organizer Confirmation cockpit reads use `confirmation.read`;
- the legacy requirements helper returns an empty result when `auth.uid()` is null even though its older execute grant remains present.

A single bounded rollback-only production authorization smoke used existing authorized Organizer/HOD identities against one existing Confirmation response. The smoke asserted that Organizer could open response editing while the round stayed closed, the HOD dashboard remained accepted and immediately exposed editing open, one country-account edit token could be minted, response/requirement counts stayed exactly one, Organizer could close editing, and the newly minted token was revoked. The smoke deliberately raised a terminal exception after all assertions so its writes were rolled back. A follow-up read confirmed the response controls were restored and no smoke token survived.

The rollback smoke intentionally did **not** submit a real song/artist content change. The final user-facing human browser smoke remains required after the Cloudflare maintenance HOD portal switch is deployed.

Post-deploy Supabase advisor comparison found no `ERROR` or `CRITICAL` finding. The INFO/WARN inventory changed as expected after adding V3 tables/functions:

- security `rls_enabled_no_policy`: `66 -> 70`;
- security `anon_security_definer_function_executable`: `57 -> 55`;
- security `authenticated_security_definer_function_executable`: `301 -> 320`;
- security `extension_in_public`: unchanged at `1`;
- leaked-password protection warning: unchanged at `1`;
- performance `unindexed_foreign_keys`: `128 -> 150`;
- performance `unused_index`: `157 -> 164`;
- performance `multiple_permissive_policies`: unchanged at `1`.

These advisor items remain tracked technical debt; none is a new release-blocking Confirmation-maintenance failure. Production egress verification remained deliberately bounded and no CI/browser automation was pointed at hosted Supabase.

### Feature rollout state

`GLOBAL_MAINTENANCE_MODE` remains enabled. The canonical Confirmation backend is now deployed and the bounded pre-enable production authorization smoke passed. The rollout change enables only the independent `MAINTENANCE_HOD_ACCESS` Worker runtime switch; all other public application routes remain under global maintenance. The Cloudflare Worker deployment and final user-facing human Organizer/HOD smoke are still pending and must be recorded before this emergency rollout is declared complete.

### Canonical database deployment procedure

Use `scripts/v3-production-supabase-push.sh` from a clean, locally authenticated operator checkout of the exact deployment candidate.

The script deliberately:

- refuses CI and GitHub Actions;
- targets only production project `dkxmnvekiopyesuzggeu`;
- requires `SOLARIS_PRODUCTION_DEPLOY_APPROVED=YES`;
- requires the pre-push remote head to equal the deployment candidate's expected production head;
- requires the repository migration head to equal the deployment candidate's expected repository head;
- reconciles only the known pre-head local/remote history representation in a temporary local view and restores it on exit;
- requires the unmatched post-head migration set to equal the exact ordered manifest that passed the production-head rehearsal;
- never uses `--include-all` for the hosted production push;
- runs `supabase db push --linked --dry-run` before any write;
- requires a second `SOLARIS_PRODUCTION_COMMIT=YES` gate for the real push;
- verifies the post-deployment migration head exactly.

### Remaining bounded rollout verification

Before declaring the emergency Confirmation-access rollout complete:

- deploy the exact merged HOD-switch commit to the production Cloudflare Worker;
- verify the normal maintenance page still renders while `GLOBAL_MAINTENANCE_MODE=true`;
- verify unrelated application routes remain maintenance-blocked;
- verify only the intended HOD recovery/edit/reset routes bypass maintenance for GET/HEAD when the HOD switch is enabled;
- perform one authorized human Organizer open-edit -> HOD dashboard/edit -> Organizer close-edit browser smoke;
- confirm the user-facing smoke does not create duplicate Confirmation requirements/responses and that closing editing revokes the active token;
- record the Cloudflare deployment SHA/time and final smoke result here.
