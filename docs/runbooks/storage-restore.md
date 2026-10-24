# Solaris V3 storage restore runbook

## Purpose

Recover Supabase Storage/media without confusing database metadata with the actual object bytes. PostgreSQL can restore bucket/object metadata while binary objects are still missing. That state is not recovered.

## Safety boundary

- Never delete, overwrite, empty or rewrite production buckets as part of a rehearsal.
- Restore into isolated buckets/project storage first.
- Keep the damaged object set available for forensic comparison when possible.
- Never expose service-role credentials, signed URLs, private bucket contents or evidence-vault objects in recovery logs.
- Do not promise a Storage RPO/RTO until the active provider plan and a measured provider-backed restore drill support it.
- Automated rehearsal must hard-refuse hosted Supabase and non-loopback database endpoints.
- Storage object deletion must use the Storage API. Direct SQL deletion of `storage.objects` removes metadata without reliably removing the underlying object bytes and can create orphans.

## Inventory before recovery

Record, where available:

- bucket names and privacy/public policy;
- object key/path;
- byte size;
- MIME/content type;
- object version/provider identifier;
- checksum/hash or ETag semantics if trustworthy for that provider;
- canonical database owner/reference;
- quarantine/finalization state;
- expected public URL/projection mapping.

Integrity evidence and private media remain private throughout recovery.

## Recovery procedure

1. Declare the recovery incident and freeze affected media writes/finalization if necessary.
2. Identify the database recovery point and the matching Storage recovery point/object source.
3. Restore database metadata only into an isolated target first.
4. Create isolated target buckets with the intended access policy.
5. Restore/copy object bytes into the isolated target without changing canonical keys unless a migration explicitly owns that mapping.
6. Produce a target object manifest and compare it with the recovery-point manifest.
7. Verify byte size and hash/checksum where a reliable checksum exists. A matching filename is not evidence of matching content.
8. Re-run the normal Solaris validation/finalization rules for objects whose trust state cannot be proven from immutable evidence.
9. Verify canonical database references resolve to the intended restored object.
10. Smoke-test public assets and authorized private retrieval without leaking signed/private URLs into logs.
11. Cut over only after database and Storage evidence agree.

## Required verification

The recovered target must account for every expected object as one of:

- restored and verified;
- intentionally absent with a documented canonical reason;
- reconstructible derivative queued for deterministic rebuild.

Unexplained missing or extra objects block recovery completion.

For public images/fonts, preserve the existing Solaris upload/finalization ceilings and signature checks. For Integrity evidence, preserve quarantine and private-access boundaries. Recovery must not become an alternate path around upload security.

## Isolated local byte-recovery rehearsal

`.github/scripts/v3-s11-storage-byte-recovery-rehearsal.sh` exercises the repository-level Storage recovery path against **local Supabase only**.

The drill:

1. obtains `API_URL`, `DB_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` from `supabase status -o env`;
2. parses both URLs and refuses any host that is not an IP loopback address or `localhost`;
3. creates a uniquely named private test bucket;
4. uploads three deterministic objects covering text, JSON and binary bytes;
5. proves a private object cannot be retrieved anonymously;
6. downloads source bytes through the authenticated Storage API into a temporary recovery snapshot;
7. records object key, SHA-256, byte size and MIME type in a manifest;
8. deletes all rehearsal objects through the current Storage batch object endpoint with a `prefixes` payload, then removes the isolated test bucket;
9. verifies Storage object metadata is gone after the API deletion rather than deleting metadata directly;
10. recreates the same bucket ID with the same private policy;
11. restores the same object keys from the byte snapshot through the Storage API;
12. downloads the restored objects and requires the complete manifest to match exactly;
13. proves the restored object remains private.

Object deletion intentionally goes through the Storage API, not direct SQL against `storage.objects`. The current Storage removal protocol sends `DELETE /storage/v1/object/{bucket}` with a JSON `prefixes` array. A single-object `DELETE /storage/v1/object/{bucket}/{key}` is not used by this rehearsal. Database metadata deletion alone can orphan object bytes and is not valid Storage recovery evidence.

The temporary bucket is unique to the rehearsal and is cleaned up after the run. The drill never reads, deletes or rewrites a production bucket.

## Exact-SHA evidence mode

The local drill can retain a machine-readable component-evidence artifact.

Evidence mode requires:

- a clean Git worktree before the drill and immediately before artifact creation;
- exact `V3_STORAGE_RECOVERY_EVIDENCE_SHA` matching checked-out `HEAD`;
- `V3_STORAGE_RECOVERY_EVIDENCE_OPERATOR` identifying the operator/rehearsal owner;
- optional bounded `V3_STORAGE_RECOVERY_EVIDENCE_ENVIRONMENT` label;
- `V3_STORAGE_RECOVERY_EVIDENCE_OUTPUT` naming the JSON artifact path.

Example:

```bash
V3_STORAGE_RECOVERY_EVIDENCE_SHA="$(git rev-parse HEAD)" \
V3_STORAGE_RECOVERY_EVIDENCE_OPERATOR="system-recovery" \
V3_STORAGE_RECOVERY_EVIDENCE_OUTPUT="artifacts/recovery/storage-byte-recovery.json" \
.github/scripts/v3-s11-storage-byte-recovery-rehearsal.sh
```

The artifact records:

- exact repository SHA;
- rehearsal UUID and operator identity;
- start/completion timestamps;
- source manifest digest;
- object keys, SHA-256 hashes, byte sizes and MIME types;
- private bucket policy;
- measured local exercise recovery duration;
- zero snapshot-to-restored-copy exercise data loss;
- restored/missing/extra counts;
- byte/key/MIME/privacy verification flags;
- explicit proof that loss injection used the Storage API deletion path;
- remaining hosted-provider follow-up.

`src/lib/v3-storage-recovery-evidence.ts` validates this artifact against the expected exact SHA and fails closed on object-set drift, missing hashes, wrong MIME types, public policy, incomplete restore counts, mixed SHA, non-local scope, missing Storage API deletion proof, or provider/certification overclaims.

## Current certification state

Solaris contains an **isolated local Supabase Storage byte-recovery drill** and an exact-SHA evidence contract. This proves the repository recovery procedure can preserve object bytes, keys, MIME metadata and private policy through a local loss/restore exercise when the focused rehearsal passes.

It is still **not proof that hosted Supabase Storage recovery is certified**. Before final S11 certification, release evidence still needs to validate the real hosted backup/export source available to the active Supabase plan, provider restore behavior/latency, and the combined database + Storage + deployment full-service recovery drill.

Database metadata restoration alone must never be counted as Storage recovery evidence.

## Evidence to retain

- exact repository SHA;
- source/recovery manifest reference;
- target manifest reference;
- bucket policy comparison;
- restored/missing/extra object counts;
- checksum verification summary;
- Storage API deletion-path verification;
- validation/finalization results;
- smoke-test results;
- measured exercise recovery duration;
- provider-backed RPO/RTO evidence when separately available;
- approval/cutover record.
