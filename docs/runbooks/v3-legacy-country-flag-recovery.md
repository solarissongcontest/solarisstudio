# Solaris V3: restored current country flags (owner-reviewed, manual-only)

**Status:** Prepared on the draft media-recovery PR. The **53 Storage objects** were
manually restored, and the **7 edition-artwork references** were separately
repaired. **This document does not authorize a live country-flag DB write.**

## Live discovery (2026-11-05)

- Destination: `dkxmnvekiopyesuzggeu`, platform `read_only`.
- `country-media` final public Storage: **46 files** (23 flag objects,
  14 background objects, 9 gallery objects).
- `countries`: 67 country rows, 52 populated current `flag_image`, 15 missing.
- Eight missing-current-flag countries have recovered flags:
  **Abeven, Linem, Oland, Rharaj, Secsewen, Witfordge, Yaria, Zarzad**.
  These eight own 21 restored flag object paths.
- Otelia also has two recovered flag objects but **already has a current flag**.
  No change is proposed.
- The other seven countries lacking flags have **no** recovered flag file.
  Never invent a mapping for them.
- `country_edition_identities`: 25 history records, all 25 `flag_image`
  fields currently blank. Historical identity matching is **separate** from
  current country-flag restoration.
- All 52 existing current flag links point to an app-managed `/api/flag`
  path rather than the new Storage project. Do not replace them.

Three of the eight affected countries have a single image content identity:
**Rharaj** (2 copies), **Secsewen** (1 copy), **Zarzad** (2 copies).
The other five contain genuinely different files and need explicit selection.
Equal `eTag`/size in Storage is supporting metadata; the owner tool makes
the distinct-content decision using the original pinned **SHA-256 values**.

## Start the review from the existing trusted Codespace

The original private `checksums.json` must still be in the local Codespace;
do not commit it. Work on the **media recovery PR branch**, not on a second
active feature branch:

```bash
git switch v3/sys-media-storage-recovery-20261104
git pull --ff-only
node --test scripts/lib/v3-country-flag-recovery.test.mjs
node scripts/v3-country-flag-reference-recovery.mjs --manifest ./checksums.json --prepare
```

This writes two private-home files:

- `~/solaris-public-flag-preview/index.html`: public-only preview of every
  recovered flag candidate for those eight countries.
- `~/solaris-country-flag-selection.json`: **all choices null** by default.
  **Nothing is approved by generating the draft.**

The preview is an entirely static file containing **only public URLs**;
the original private manifest and service-role credentials are not embedded.

To review it inside Codespaces, start a server that serves **only the isolated
public-preview folder**, never the Codespaces home or repository:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory ~/solaris-public-flag-preview
```

Open forwarded port **8765** in the Codespaces **Ports** panel with visibility
set to **Private**. Click one image per country to designate its **current**
flag. Leave any ambiguous/unverified country unselected. Click
**Download reviewed flag selection JSON**; upload the downloaded JSON to
Codespaces and provide its path using `--selection`. Stop the server when
finished (Ctrl+C).

Do not select a historical `Linem 2022` file as its current flag merely
because the filename has a year. Old edition/identity flags belong in a
separate reviewed per-edition mapping. Likewise, do not infer Oland's, Yaria's,
Abeven's or Witfordge's canonical current version from filename order.

## Protected readback and SQL generation (still zero production writes)

This is a **different authorization** from the earlier Storage-only approval.
The operator explicitly authorizes current `countries.flag_image` repairs,
is verified with a GitHub owner token, and uses the existing protected
`SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY` for **read-only** Storage and country
checks. Secrets must remain in Codespaces secrets, never in the selection JSON
or Git.

```bash
export SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_DESTINATION
export SOLARIS_RECOVERY_FLAG_REFERENCE_APPROVED=I_APPROVE_SELECTED_CURRENT_COUNTRY_FLAGS

node scripts/v3-country-flag-reference-recovery.mjs \
  --manifest ./checksums.json \
  --approve \
  --selection ~/solaris-country-flag-selection.json
```

If the browser's downloaded file has a different location (e.g., dragged
into `/workspaces/solarisstudio`), specify that exact path. The script
must observe all selected current `flag_image` values still blank, the
platform still `read_only`, public/private bucket privacy, and the
**full SHA-256, MIME and byte size** of every selected destination image.
It also runs pure local tests, verifies the authenticated personal GitHub
owner, and refuses modified/unknown image identities.

It then writes `~/solaris-country-flag-reference-repair.sql` with no live DB
mutation. Inspect it. Run it **once** through the **destination project's
protected Supabase SQL Editor**, after a deliberate manual production-change
decision. Its single transaction checks the exact approved countries,
Storage paths/sizes/MIME, empty current flags and platform mode again,
performs only approved `countries.flag_image` updates, and inserts one
`admin_audit_log` record per modified country. Any mismatch rolls back
the entire batch.

The SQL intentionally does **not** update old country editions, existing
flag images, themes, galleries, backgrounds, Confirmation, Results or votes.
The original files remain unchanged. There is no automated Supabase hosted
test traffic from CI.

## After the SQL Editor reports success

Verify live counts and owner identity:

```sql
SELECT name, flag_image
FROM public.countries
WHERE name IN ('Abeven','Linem','Oland','Rharaj','Secsewen','Witfordge','Yaria','Zarzad')
ORDER BY name;

SELECT country_id, action, created_at
FROM public.admin_audit_log
WHERE action='v3.legacy_country_flag_recovery'
ORDER BY created_at DESC;
```

Then check public country flags on mobile and desktop at natural **3:2**
presentation ratio, including legacy flag-image fallback behaviour.
Full visual verification, remaining seven countries without source assets,
and separate historical/edition-specific flags are still outstanding.
