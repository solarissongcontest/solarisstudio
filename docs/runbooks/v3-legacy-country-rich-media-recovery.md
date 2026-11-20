# Solaris V3: owner-reviewed background and gallery reference recovery

**Read-only review and generated SQL only.** Do not run this procedure in
CI or merge the recovery PR solely on the strength of a local preview.

## Verified scope (2026-11-05)

Destination Supabase project: `dkxmnvekiopyesuzggeu`, currently
`read_only`. Original historical public-file inventory: `checksums.json`
SHA-256 pinned by `parseStagedManifest`.

The previously approved owner operation restored all 53 eligible images:
7 edition artworks and 46 country-media images. Subsequent owner operations
restored 7 edition references and 8 missing current country flag references.

Remaining recoverable country-media objects in the public
`country-media` bucket: **14 background versions** belonging to eight
countries and **9 gallery files** belonging to five countries.
The oversized tenth Yaria gallery file is **private quarantine only**
and must not be linked to a public image URL.

The 8 countries with background alternatives are Aquliateria (1),
Diaria (3), Jaudia (1), Linem (2), Oland (1), Temia (1), Yaria (4),
Zarzad (1).

The 5 countries with public gallery assets are Bentagya (1),
Jaudia (3), Oland (1), Vendia (1), Yaria (3).

Country themes currently use `background_mode=gradient`; the affected
eight rows all have `design_version=2` with a synchronized
`design_v2.background.mode=gradient`, no image URL/path. The new
background repair deliberately changes **only** selected image fields and
both background modes to `image`, preserving every other legacy and
V2 design property. Unselected countries retain their gradient.

`public.country_media` is currently empty. Gallery recovery inserts one
row per explicitly selected image, no guessed captions, no duplicate
restoration, no change to existing page sections, flags or results.
Order is by pinned source path (stable; adjust manually in the UI after
recovery if the historical order is known).

## Owner review in Codespaces

```bash
git switch v3/sys-media-storage-recovery-20261104
git pull --ff-only
node --test scripts/lib/v3-country-rich-media-recovery.test.mjs

node scripts/v3-country-rich-media-reference-recovery.mjs \
  --manifest ./checksums.json \
  --prepare
```

The CLI creates private home files:

- `~/solaris-public-rich-media-preview/index.html` (interactive review).
- `~/solaris-country-rich-media-selection.json` (all null/unselected).

Open the **isolated public-preview folder only**, not the repository or
home directory, as a private Codespaces port:

```bash
python3 -m http.server 8767 --bind 127.0.0.1 \
  --directory ~/solaris-public-rich-media-preview
```

Open port 8767 in the Codespaces Ports panel and keep the port **Private**.
For every country, choose at most **one** active background or keep the
current gradient. For gallery entries, individually select each original
image you want returned to the public country gallery. For example,
Jaudia has two files with `img_0108` in their names; inspect whether
those represent distinct photos/versions instead of automatically
restoring both.

Click **Download reviewed background/gallery selection JSON**.
Upload the downloaded JSON into your private Codespaces session, for
example `/workspaces/solarisstudio/solaris-country-rich-media-selection.json`,
then move it to your home directory **without committing it**:

```bash
mv ./solaris-country-rich-media-selection.json \
   ~/solaris-country-rich-media-selection.json
```

Stop the isolated server with Ctrl+C.

## Separate owner-approved readback and SQL generation

This authorization is **separate** from the prior media uploads,
edition-artwork reference repair and flag reference repair. No protected
key goes into Git, preview HTML, selection JSON or chat messages.

The owner-only CLI uses the established protected
`SOLARIS_V3_SUPABASE_SERVICE_ROLE_KEY` in the Codespaces environment to
**read** current country/theme/gallery metadata and download each
selected final public image to re-check original SHA-256, MIME and exact
size. It revalidates the `read_only` platform, public/private bucket
configuration, identity ownership and changes since preview.
It never sends a production mutation itself.

```bash
export SOLARIS_RECOVERY_MANUAL_INVENTORY_APPROVED=YES_READ_DESTINATION
export SOLARIS_RECOVERY_RICH_MEDIA_REFERENCES_APPROVED=I_APPROVE_SELECTED_COUNTRY_BACKGROUNDS_AND_GALLERIES

node scripts/v3-country-rich-media-reference-recovery.mjs \
  --manifest ./checksums.json \
  --approve \
  --selection ~/solaris-country-rich-media-selection.json
```

Expected output: a summary with `production_references_written: 0`,
and an SQL file at:

`~/solaris-country-rich-media-reference-repair.sql`

Review it completely. Only after an explicit operator decision to restore
these **selected** active backgrounds and gallery references, execute the
whole file **once** in the destination project's protected
Supabase SQL Editor:

https://supabase.com/dashboard/project/dkxmnvekiopyesuzggeu/sql/new

The SQL performs an all-or-nothing transaction: validates source
country ownership and restored Storage object metadata, locks matching
rows, refuses changed/missing V2 theme preconditions or existing gallery
rows, updates selected active backgrounds in both legacy and V2
representation, inserts selected gallery records, and writes exact-count
`admin_audit_log` rows. Any mismatch aborts/rolls back everything.

The generated SQL appends two read-only verification queries after
COMMIT. Additionally verify all audit entries:

```sql
SELECT action,count(*),max(created_at)
FROM public.admin_audit_log
WHERE action IN ('v3.legacy_country_background_recovery',
                 'v3.legacy_country_gallery_recovery')
GROUP BY action ORDER BY action;
```

Retain original images and private quarantine. Do not broaden the SQL
to historical country flags, current country flags, unpublished media
or unrelated country themes.

## Still separate after this repair

- Seven countries lack original flag files in the approved archive.
- Historical per-edition flag assignments need manual country+edition
  identification; do not map old flags to current national identities.
- The oversized Yaria gallery original needs approved optimization and
  a new verified upload, without overwriting the private original.
- Validate country UI on desktop and mobile; original image aspect
  ratios should remain visible on non-decorative surfaces.
- The entire V3 release has independent release and certification
  requirements; a recovered media reference is not a release certificate.
