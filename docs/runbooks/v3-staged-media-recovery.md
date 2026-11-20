# Solaris V3: legacy public-image recovery from private staging

**Status:** implemented on PR #2045, **not a production restoration or release certification**.

- Destination: `dkxmnvekiopyesuzggeu`.
- Existing private bucket: `solaris-upload-quarantine`, 54 image files, 25,673,162 bytes.
- Original groups: `country-media` (47) and `edition-artwork` (7).
- The 54 original SHA-256 values and source object identities are pinned by the original `checksums.json` digest `268e75f2bc3c25f324542b90f5350c7fcbff5b2eddfe83f97e3b2a894355a4b4`.
- Read-only destination metadata matches the source inventory fingerprint. **This does not establish destination byte equality; the new command performs that check.**
- At the last inspection, final public buckets contained zero files. The seven affected published editions have empty artwork references.

## Sole-repository-owner recovery (GitHub-verified, no fictional reviewer)

The special owner path is limited to the verified owner of the **personal** repository
`solarissongcontest/solarisstudio`. It does not remove the separate independent-reviewer
path for other operators. The owner must authenticate to GitHub at **signing and execution**
time with a protected personal token. The remote GitHub API must report the exact owner
identity and repository-admin permission. A self-written owner name in JSON is never sufficient.

The original `checksums.json` is pinned by SHA-256. Every candidate also has an original
public Storage URL under the old project. In the owner path, the draft pre-populates
the **literal original public URL**, its hashed provenance identifier, the original
manifest digest, and a checksum-bound quarantine validation identifier. These are
**legacy recovery evidence**, not invented canonical V3 media-review receipt IDs.
By signing, the owner explicitly attests that each selected asset was previously
public. Before publication the runner re-downloads and hashes the actual original
bytes and performs target collision and privacy checks. Any changed provenance
field causes a refusal.

Use a trusted operator Codespace or personal machine. Keep the existing
`checksums.json` private/untracked and keep credentials only in protected
environment/secrets (never in chat, committed files or CI).

```bash
git pull --ff-only
node --test scripts/lib/v3-media-recovery-core.test.mjs scripts/lib/v3-staged-media-recovery.test.mjs
node scripts/v3-owner-media-approval.mjs --prepare --manifest ./checksums.json
```

Review `~/media-approval-OWNER-DRAFT.json` (53 selected assets; 1 oversized
excluded). Remove any item **and its matching asset clearance** if it was not
previously published. Do not add unpublished, private, or unrecognized assets.
The owner authorization is **not** granted merely by creating the draft.

Use a Codespaces secret named `SOLARIS_RECOVERY_GITHUB_OWNER_TOKEN` for a token
belonging to the actual GitHub owner, or the `GITHUB_TOKEN` environment variable
if it genuinely authenticates as that owner and carries repository admin access.
Use the existing protected destination `SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY`
only for the separate manual Storage runner. Do not put either token in JSON.

```bash
export SOLARIS_RECOVERY_OWNER_DECISION=I_APPROVE_RESTORATION_OF_PREVIOUSLY_PUBLIC_SOLARIS_IMAGES
node scripts/v3-owner-media-approval.mjs --sign --manifest ./checksums.json
```

Signing performs local **fake-Storage-only** Node tests, confirms the actual
authenticated GitHub owner, writes an expiring 2-hour HMAC-signed approval to
`~/approved-media-recovery.json` (mode 0600), and creates a private 0600
operator-local signing secret if no protected env key was provided. It binds the
current git HEAD SHA as the rehearsal SHA. Both files stay **outside the repo**.
An existing signed approval is never overwritten silently.

Only after reviewing the proposed publication scope, and after a separate
explicit production change decision, acknowledge writes:

```bash
export SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_DESTINATION
export SOLARIS_RECOVERY_PRODUCTION_WRITE_APPROVED=APPROVE_REAL_PRODUCTION_STORAGE_WRITE
export SOLARIS_RECOVERY_READ_ONLY_EXCEPTION_APPROVED=APPROVE_SCOPED_READ_ONLY_MEDIA_RECOVERY
node scripts/v3-staged-media-recovery.mjs --manifest ./checksums.json --execute \
  --approval-file ~/approved-media-recovery.json
```

The runner again verifies the authenticated GitHub owner, code HEAD, signed
approval and scoped mode **before any upload**. It records private per-file
checkpoints and confirms post-upload hashes. The original quarantine is kept.
`read_only`, the existing Confirmation edit exception, all unrelated writes,
and Results remain unchanged. **This restores Storage objects only**, not
edition/country database references. Check them through a separately authorized
governed reference repair after all intended object bytes are verified.

If GitHub owner authentication fails or the approval expires, **stop** rather
than changing policies, faking evidence or turning off read-only.

## Trusted operator procedure (independent reviewer route)

The required operator has to authenticate to the **actual V3 Storage API**. No available ChatGPT Supabase connector action supports direct binary Storage upload or copy; never insert fake Storage rows via SQL.

The separate manual script is `scripts/v3-staged-media-recovery.mjs` and its pure core is `scripts/lib/v3-staged-media-recovery.mjs`. It has a dry-run default:

1. On a trusted personal/organization-owned computer, copy the original archive's `checksums.json` to a private directory. Do **not** place service credentials on a school-managed laptop, in ChatGPT, or in CI.
2. Provision a narrowly controlled, temporary destination service credential in that machine's protected environment. Set `SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_DESTINATION`.
3. Inspect actual staged bytes: `node scripts/v3-staged-media-recovery.mjs --manifest /private/checksums.json`. This validates 54 SHA-256 values and image signatures; it does not mutate Storage.
4. Prepare the signed, expiring manual authorization binding the entire manifest digest, exact selected asset identities, canonical owner, independently reviewed publication evidence and media validation evidence. Only previously approved public media qualify. The separate owner path above uses verified original-public-URL evidence, verified staged bytes and an authenticated owner attestation. No per-asset evidence may be invented or derived from bucket visibility alone.
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
