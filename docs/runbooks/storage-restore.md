# Solaris V3 storage restore runbook

## Purpose

Recover Supabase Storage/media without confusing database metadata with the actual object bytes. PostgreSQL can restore bucket/object metadata while every binary object is still missing. That state is not recovered.

## Safety boundary

- Never delete, overwrite, empty or rewrite production buckets as part of a rehearsal.
- Restore into isolated buckets/project storage first.
- Keep the damaged object set available for forensic comparison when possible.
- Never expose service-role credentials, signed URLs, private bucket contents or evidence-vault objects in recovery logs.
- Do not promise a storage RPO/RTO until the active provider plan and a measured restore drill support it.

## Inventory before recovery

Record, where available:

- bucket names and privacy/public policy,
- object key/path,
- byte size,
- MIME/content type,
- object version/provider identifier,
- checksum/hash or ETag semantics if trustworthy for that provider,
- canonical database owner/reference,
- quarantine/finalization state,
- expected public URL/projection mapping.

Integrity evidence and private media remain private throughout recovery.

## Recovery procedure

1. Declare the recovery incident and freeze affected media writes/finalization if necessary.
2. Identify the database recovery point and the matching storage recovery point/object source.
3. Restore database metadata only into an isolated target first.
4. Create isolated target buckets with the intended access policy.
5. Restore/copy object bytes into the isolated target without changing canonical keys unless a migration explicitly owns that mapping.
6. Produce a target object manifest and compare it with the recovery-point manifest.
7. Verify byte size and hash/checksum where a reliable checksum exists. A matching filename is not evidence of matching content.
8. Re-run the normal Solaris validation/finalization rules for objects whose trust state cannot be proven from immutable evidence.
9. Verify canonical database references resolve to the intended restored object.
10. Smoke-test public assets and authorized private retrieval without leaking signed/private URLs into logs.
11. Cut over only after database and storage evidence agree.

## Required verification

The recovered target must account for every expected object as one of:

- restored and verified,
- intentionally absent with a documented canonical reason,
- reconstructible derivative queued for deterministic rebuild.

Unexplained missing or extra objects block recovery completion.

For public images/fonts, preserve the existing Solaris upload/finalization ceilings and signature checks. For Integrity evidence, preserve quarantine and private-access boundaries. Recovery must not become an alternate path around upload security.

## Current certification state

The repository does not currently contain an isolated provider-level Storage byte restore drill. This runbook is therefore **procedure/evidence foundation**, not proof that S11 Storage recovery is certified. Database metadata restoration alone must never be counted as Storage recovery evidence.

## Evidence to retain

- exact repository SHA,
- source/recovery manifest reference,
- target manifest reference,
- bucket policy comparison,
- restored/missing/extra object counts,
- checksum verification summary,
- validation/finalization results,
- smoke-test results,
- measured recovery duration,
- approval/cutover record.
