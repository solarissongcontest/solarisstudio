# Solaris V3 manual Storage recovery

**Status:** implementation + isolated tests only. **No production write authorization or release certification.**

Source: oxtbskojiexkaspputvo (old solaris-studio-production, eu-north-1).
Destination: dkxmnvekiopyesuzggeu (current V3 Solaris Studio, eu-central-1).

This augments storage-restore.md and migration-hardening.md. Direction is pinned in code. No PostgreSQL bulk copy, policy changes, bucket creation, CDN publication, database writer, or PR #1400 Results changes are part of this operation. The old project remains intact.

## Operator-only dry run

1. Verify both exact project identities, active media PRs, current SHA, and bucket privacy. Resolve missing/mismatched buckets through separately reviewed infrastructure changes, never inside the recovery command.
2. Rehearse the focused failure modes locally with: node --test scripts/lib/v3-media-recovery-core.test.mjs. The tests use fake Storage without hosted endpoints. They do not constitute the provider restore drill or S14 certification.
3. On a trusted operator machine with the repository dependencies installed, load distinct old and V3 service-role Storage credentials from the secrets manager. Never commit, print or expose them to GitHub Actions.
4. Set SOLARIS_OLD_SUPABASE_SERVICE_ROLE_KEY, SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY, and SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_BOTH_PROJECTS.
5. Run: node scripts/v3-media-recovery.mjs. Without --execute this performs read-only, bounded Storage inventory, real byte SHA-256 checks, MIME signature/size validation, destination byte comparisons, and guarded DB reference-table reads.

Confidential reports live under ~/.local/state/solaris-v3-media-recovery/ with 0700 directory and 0600 file permissions. Files include recovery-manifest.json (actual per-object hashes and keys), references-source.json, references-destination.json, reference-proposals.json, summary.json, transfer-results.json, and verified-checkpoints.jsonl. These may contain private and unpublished paths. NEVER attach them verbatim to the public PR or CI logs. Publish redacted aggregate counts and the manifest digest only.

## Manual production-write gate

The responsible operator and independent protected signing authority must review every exact file's trust/publication status. Old public Storage placement alone does not establish authorization for new public exposure. Untrusted legacy media must be revalidated through Solaris's existing quarantine/validation/finalization contract before publication.

A separately issued expiring HMAC-SHA-256 signed JSON approval contains:

- source_project and destination_project, matching the exact IDs above;
- manifest_sha256 equal to the current read-only inventory digest;
- scope equal to storage-only-non-overwrite;
- operator, change_ticket, local_rehearsal_sha and expires_at;
- reviewed_assets listing every individually approved bucket/path#SHA256 identity that would transfer;
- signature: HMAC-SHA-256 over canonical stableJson() of every field excluding signature, using a protected key at least 32 bytes long.

Load the key from the approved credential manager into SOLARIS_RECOVERY_APPROVAL_HMAC_KEY only on the manual machine. Set SOLARIS_RECOVERY_PRODUCTION_WRITE_APPROVED=APPROVE_REAL_PRODUCTION_STORAGE_WRITE. Only after separate approval and rehearsal, invoke:

node scripts/v3-media-recovery.mjs --execute --approval-file /private/path/approved.json

The command refuses CI, wrong direction, unsigned/expired/mismatched approvals, unreviewed source hashes, unresolved collisions, unavailable objects, missing buckets, and incomplete DB reference inspection. Each supported Storage upload uses upsert:false, with destination re-download and SHA-256 equality required before checkpointing. Ambiguous transport is never automatically accepted. New run, new manifest and approval. Old Storage objects are never deleted.

## DB reference recovery and R2

The command produces **proposals only**, never DB writes. Match stable canonical identifiers, including (country_id,edition_id) for historical flags. Missing references, stale URLs, or missing rows require governed Organizer recovery with expected-version guards, owner/asset validation, audit receipt and unchanged publication state. Preserve V3 conflicts. Do not migrate unrelated Auth, grants, ballots, Results or receipts.

R2 may later receive only individually verified *published* public derivatives. Use immutable content-addressed/versioned keys and a server-authorized public projection. R2 must not approve uploads, change permissions, moderate content, or publish Results. Never expose beta-feedback, integrity-evidence, unpublished entries, draft data, ballots, tokens or Organizer responses through public R2 or Workers Cache. No D1 is required.

## Release gate

Evidence must cover exact final SHA, isolated rehearsal, manual approval, source/target byte equality, per-bucket transfer counts, private denial checks, public rendering on the actual destination, authorized DB restoration receipts, and rollback proof. Until then this is preparation, not recovery certification.
