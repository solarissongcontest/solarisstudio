# Solaris V3: legacy public-image recovery from private staging

**Status:** implemented on PR #2045, **not a production restoration or release certification**.

- Destination: `dkxmnvekiopyesuzggeu`.
- Existing private bucket: `solaris-upload-quarantine`, 54 image files, 25,673,162 bytes.
- Original groups: `country-media` (47) and `edition-artwork` (7).
- The 54 original SHA-256 values and source object identities are pinned by the original `checksums.json` digest `268e75f2bc3c25f324542b90f5350c7fcbff5b2eddfe83f97e3b2a894355a4b4`.
- Read-only destination metadata matches the source inventory fingerprint. **This does not establish destination byte equality; the new command performs that check.**
- At the last inspection, final public buckets contained zero files. The seven affected published editions have empty artwork references.

## Trusted operator procedure

The required operator has to authenticate to the **actual V3 Storage API**. No available ChatGPT Supabase connector action supports direct binary Storage upload or copy; never insert fake Storage rows via SQL.

The separate manual script is `scripts/v3-staged-media-recovery.mjs` and its pure core is `scripts/lib/v3-staged-media-recovery.mjs`. It has a dry-run default:

1. On a trusted personal/organization-owned computer, copy the original archive's `checksums.json` to a private directory. Do **not** place service credentials on a school-managed laptop, in ChatGPT, or in CI.
2. Provision a narrowly controlled, temporary destination service credential in that machine's protected environment. Set `SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_DESTINATION`.
3. Inspect actual staged bytes: `node scripts/v3-staged-media-recovery.mjs --manifest /private/checksums.json`. This validates 54 SHA-256 values and image signatures; it does not mutate Storage.
4. Prepare the signed, expiring manual authorization binding the entire manifest digest, exact selected asset identities, canonical owner, independently reviewed publication evidence and media validation evidence. Only previously approved public media qualify. No per-asset evidence may be invented or derived from bucket visibility alone.
5. In `read_only`, include the separately reviewed, signed `read_only_recovery_exception` scope `historical-public-media-only` and a distinct acknowledgement `SOLARIS_RECOVERY_READ_ONLY_EXCEPTION_APPROVED=APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY`. Keep global operating mode and Confirmation controls unchanged.
6. After isolated/local provider rehearsal and a separate approved production-change decision, set `SOLARIS_RECOVERY_PRODUCTION_WRITE_APPROVED=APPROVE_REAL_PRODUCTION_STORAGE_WRITE` and supply the protected HMAC signing key. Run `node scripts/v3-staged-media-recovery.mjs --manifest /private/checksums.json --execute --approval-file /private/approval.json`.
7. The script first validates staged bytes and destination collisions, then uses `upsert:false`, validates the resulting target byte hash, and writes a private checkpoint under the operator home directory. Source staging remains intact; no database reference fields are written by this script.
8. Verify all final public objects and authorization/visibility before approved DB reference recovery. There are seven unambiguous edition-artwork **proposals**, but no permission to write them until target objects exist and a governed admin command executes. Country flags/backgrounds have ambiguous legacy versions and need explicit selection. See `docs/reports/v3-staged-media-reference-proposals-2026-11-04.json`.

## Oversized original

One recovered gallery JPEG is 5,679,181 bytes, exceeding the canonical 5 MiB public-upload validation cap. It remains excluded. A loss-minimized 5,107,168-byte derivative exists locally but has a different SHA-256 and has **not** been validated, reviewed or uploaded. Do not silently substitute it.

## Permanent boundaries

- Never allow hosted production traffic from GitHub Actions/Browser Audit; the pure fake-Storage suites alone run in CI.
- Never change global `read_only` just to publish media or interfere with existing Confirmation-edit exceptions.
- Never invent per-asset approval receipts or service credentials; never make the private quarantine bucket public.
- Do not mutate Results, jury, votes, old source Storage, or PR #1400.
- Original staging is retained for readback, rollback and further review.
