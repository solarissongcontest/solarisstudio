# Solaris Studio V3 production Supabase deployment ledger

This ledger records production database synchronization evidence. It must never contain credentials, database passwords, access tokens, service-role keys, or user data.

## 2026-10-17 Confirmation-maintenance refresh

- Production-state inspection source main SHA: `96ccdfbfcc63b6b61d6e233f008cef3c4b44204c`
- Production project ref: `dkxmnvekiopyesuzggeu`
- Production project name: `Solaris Studio`
- Production migration head verified read-only: `20261014020000_v3_me_cutover`
- Repository migration head: `20261017143200_confirmation_maintenance_read_authority`
- Canonical production lag: **55 migrations**
- Production database DDL performed by this refresh so far: **none**

### Why the connected migration action is not used for this backlog

The connected Supabase migration action generates its own migration version rather than preserving the repository timestamps. Applying the Confirmation hotfix migrations through that path would make `supabase_migrations.schema_migrations` diverge further from version control and would cause the canonical CLI deployment to attempt the repository migrations again later. This deployment lane therefore preserves history and uses `supabase db push --linked` from an explicitly approved local operator checkout.

### Confirmation production mismatch verified

Bounded read-only production inspection found the exact failure the October 17 hotfix is designed to repair:

- `studio2_country_cockpit(...)` still requires mutation-level `confirmation.manage` for a read projection;
- legacy Confirmation admin reads still use old delegation/admin authorization;
- `admin_update_confirmation_controls(...)` is still the old legacy-authority implementation;
- `public_country_account_confirmation_dashboard()` is absent;
- production migration history stops at `20261014020000`.

Therefore the merged maintenance HOD portal and Organizer Confirmation authority cannot be considered production-operational until the canonical migration chain reaches `20261017143200`.

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

### Canonical pending migration chain

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

### Feature rollout state

`GLOBAL_MAINTENANCE_MODE` remains enabled. `MAINTENANCE_HOD_ACCESS` remains disabled while the production database is behind the required Confirmation contracts. It must not be enabled until the canonical migration deployment succeeds and the bounded authorized Organizer/HOD production smoke path passes.

### Canonical database deployment procedure

Use `scripts/v3-production-supabase-push.sh` from a clean, locally authenticated operator checkout of the exact current `main` after reviewing this deployment candidate.

The script deliberately:

- refuses CI and GitHub Actions;
- targets only production project `dkxmnvekiopyesuzggeu`;
- requires `SOLARIS_PRODUCTION_DEPLOY_APPROVED=YES`;
- requires the pre-push remote head to equal `20261014020000`;
- requires the repository migration head to equal `20261017143200`;
- reconciles only the known pre-head local/remote history representation in a temporary local view and restores it on exit;
- requires the unmatched post-head migration set to equal the exact ordered 55-version manifest that passed the production-head rehearsal;
- never uses `--include-all` for the hosted production push;
- runs `supabase db push --linked --dry-run` before any write;
- requires a second `SOLARIS_PRODUCTION_COMMIT=YES` gate for the real push;
- verifies the post-deployment migration head is exactly `20261017143200`.

### Required bounded post-deploy verification

After a successful push, perform only bounded production checks:

- migration ledger head is `20261017143200`;
- `public_country_account_confirmation_dashboard()` exists with authenticated-only execution;
- `studio2_country_cockpit(...)` and HOD inspection use read authority;
- `admin_update_confirmation_controls(...)` uses exact-edition Confirmation management authority;
- open-editing leaves round state and Confirmation requirement unchanged;
- close-editing revokes active edit tokens;
- Supabase security and performance advisors show no new release-blocking issue;
- one authorized human smoke path verifies Organizer open editing -> HOD dashboard/edit -> Organizer close editing without automated production crawling.

Append the deployment UTC timestamp, exact deployed Git SHA, migration head before/after, advisor comparison, and bounded smoke result after the operator push completes.
